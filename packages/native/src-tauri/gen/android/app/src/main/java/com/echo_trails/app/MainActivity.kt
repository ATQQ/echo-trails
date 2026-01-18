package com.echo_trails.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import android.content.Context
import android.content.Intent
import android.net.Uri
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.BasicFileAttributes
import android.provider.MediaStore
import android.database.Cursor
import android.util.Log
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.StructStat
import android.provider.OpenableColumns
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class FileInfo(val lastModified: Long, val creationTime: Long, val size: Long)

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  companion object {
    private const val TAG = "EchoTrails"

    @JvmStatic
    fun getFileInfo(filePath: String): FileInfo? {
      try {
        // 如果是 content:// URI，尝试通过 ContentResolver 获取
        if (filePath.startsWith("content://")) {
            return null
        }

        val file = File(filePath)
        if (!file.exists()) {
          return null
        }
        
        // 默认使用 lastModified
        var lastModified = file.lastModified()
        var creationTime = lastModified
        val size = file.length()

        // 尝试从 BasicFileAttributes 获取更精确的时间 (需要 Android O 以上)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
             try {
                 val attrs = Files.readAttributes(file.toPath(), BasicFileAttributes::class.java)
                 creationTime = attrs.creationTime().toMillis()
                 lastModified = attrs.lastModifiedTime().toMillis()
             } catch (e: Exception) {
                 e.printStackTrace()
             }
        }
        
        return FileInfo(lastModified, creationTime, size)
      } catch (e: Exception) {
        e.printStackTrace()
        return null
      }
    }

    @JvmStatic
    fun getFileInfoWithContext(context: Context, filePath: String): FileInfo? {
        try {
            Log.d(TAG, "getFileInfoWithContext: $filePath")
            
            if (filePath.startsWith("content://")) {
                val uri = Uri.parse(filePath)
                
                // 1. 尝试使用 ParcelFileDescriptor 获取 (最可靠的方式获取 mtime 和 size)
                try {
                    context.contentResolver.openFileDescriptor(uri, "r")?.use { pfd ->
                        val fd = pfd.fileDescriptor
                        val stat = Os.fstat(fd)
                        var lastModified = stat.st_mtime * 1000 // st_mtime is seconds
                        val size = stat.st_size
                        
                        // 某些情况下 Photo Picker 返回的 st_mtime 可能是拷贝时间而不是原始拍摄时间
                        // 尝试从 MediaStore 元数据中获取更准确的拍摄时间 (date_taken)
                        try {
                            val cursor = context.contentResolver.query(uri, 
                                arrayOf(
                                    MediaStore.MediaColumns.DATE_ADDED,
                                    MediaStore.MediaColumns.DATE_MODIFIED,
                                    // 注意：DATE_TAKEN 在某些 Android 版本或 PhotoPicker 模式下可能不可用
                                    "datetaken" 
                                ), 
                                null, null, null)
                                
                            cursor?.use {
                                if (it.moveToFirst()) {
                                    // 优先尝试 date_taken (拍摄时间)
                                    val dateTakenIndex = it.getColumnIndex("datetaken")
                                    if (dateTakenIndex != -1) {
                                        val dateTaken = it.getLong(dateTakenIndex)
                                        if (dateTaken > 0) {
                                            Log.d(TAG, "Found datetaken from cursor: $dateTaken")
                                            lastModified = dateTaken
                                        }
                                    }
                                    
                                    // 其次尝试 date_modified (如果 datetaken 没取到)
                                    if (lastModified == stat.st_mtime * 1000) { // 还没被 datetaken 更新
                                        val dateModifiedIndex = it.getColumnIndex(MediaStore.MediaColumns.DATE_MODIFIED)
                                        if (dateModifiedIndex != -1) {
                                            val dateModified = it.getLong(dateModifiedIndex)
                                            if (dateModified > 0) {
                                                // DATE_MODIFIED 通常是秒
                                                Log.d(TAG, "Found DATE_MODIFIED from cursor: $dateModified")
                                                lastModified = dateModified * 1000
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to query metadata from cursor: ${e.message}")
                        }

                        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
                        val dateStr = dateFormat.format(Date(lastModified))
                        val sizeStr = android.text.format.Formatter.formatFileSize(context, size)
                        
                        Log.d(TAG, "Got info via PFD + Cursor: mtime=$dateStr, size=$sizeStr")
                        
                        // 对于 content uri，creationTime 通常不可用，使用 lastModified
                        return FileInfo(lastModified, lastModified, size)
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to get info via ParcelFileDescriptor: ${e.message}")
                }

                // 2. 如果 PFD 失败，尝试查询 Cursor
                val cursor = context.contentResolver.query(uri, null, null, null, null)
                cursor?.use {
                    if (it.moveToFirst()) {
                        var lastModified: Long = 0
                        var size: Long = 0

                        // Size
                        val sizeIndex = it.getColumnIndex(OpenableColumns.SIZE)
                        if (sizeIndex != -1) {
                            size = it.getLong(sizeIndex)
                        }

                        // Last Modified
                        val lastModifiedIndex = it.getColumnIndex("last_modified") // DocumentsContract
                        if (lastModifiedIndex != -1) {
                            lastModified = it.getLong(lastModifiedIndex)
                        } else {
                            val dateModifiedIndex = it.getColumnIndex(MediaStore.MediaColumns.DATE_MODIFIED)
                            if (dateModifiedIndex != -1) {
                                lastModified = it.getLong(dateModifiedIndex) * 1000
                            } else {
                                val dateAddedIndex = it.getColumnIndex(MediaStore.MediaColumns.DATE_ADDED)
                                if (dateAddedIndex != -1) {
                                    lastModified = it.getLong(dateAddedIndex) * 1000
                                }
                            }
                        }
                        
                        Log.d(TAG, "Got info via Cursor: mtime=$lastModified, size=$size")
                        
                        if (lastModified > 0 || size > 0) {
                             // 如果没有时间但有大小，使用当前时间作为修改时间? 或者 0?
                             // 最好还是尽量返回有效数据
                             val effectiveTime = if (lastModified > 0) lastModified else System.currentTimeMillis()
                             return FileInfo(effectiveTime, effectiveTime, size)
                        }
                    }
                }
            }
            
            // Fallback to normal file handling
            if (filePath.startsWith("content://")) {
                Log.w(TAG, "All attempts failed for content URI: $filePath")
                return null
            }
            
            return getFileInfo(filePath)
        } catch (e: Exception) {
            e.printStackTrace()
            Log.e(TAG, "Error in getFileInfoWithContext", e)
            return null
        }
    }

    @JvmStatic
    fun installApk(context: Context, filePath: String) {
        try {
            val file = java.io.File(filePath)
            if (!file.exists()) {
                return
            }

            val authority = context.packageName + ".fileprovider"
            val uri = androidx.core.content.FileProvider.getUriForFile(context, authority, file)

            val intent = Intent(Intent.ACTION_VIEW)
            intent.setDataAndType(uri, "application/vnd.android.package-archive")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
  }
}
