package com.echo_trails.app

import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import android.system.Os
import android.system.OsConstants
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.graphics.BitmapFactory
import android.webkit.MimeTypeMap
import java.io.File
import java.nio.file.Files
import java.nio.file.attribute.BasicFileAttributes
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.json.JSONObject

object FileHelper {
    private const val TAG = "EchoTrails"

    private fun calculateMD5(context: Context, uri: Uri): String? {
        try {
            context.contentResolver.openInputStream(uri)?.use { inputStream ->
                val digest = java.security.MessageDigest.getInstance("MD5")
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
                val md5Bytes = digest.digest()
                return md5Bytes.joinToString("") { "%02x".format(it) }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    private fun calculateMD5(file: File): String? {
        try {
            if (!file.exists()) return null
            file.inputStream().use { inputStream ->
                val digest = java.security.MessageDigest.getInstance("MD5")
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
                val md5Bytes = digest.digest()
                return md5Bytes.joinToString("") { "%02x".format(it) }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

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
            var width = 0
            var height = 0
            
            val md5 = calculateMD5(file)

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

            // 获取图片或视频的宽高
            try {
                val extension = file.extension.lowercase(Locale.getDefault())
                val imageExtensions = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp")
                val videoExtensions = setOf("mp4", "mov", "avi", "mkv", "webm")

                if (imageExtensions.contains(extension)) {
                    val options = BitmapFactory.Options()
                    options.inJustDecodeBounds = true
                    BitmapFactory.decodeFile(filePath, options)
                    width = options.outWidth
                    height = options.outHeight

                    // 尝试从 EXIF 获取拍摄时间
                    try {
                        val exif = ExifInterface(filePath)
                        val dateTimeOriginal = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
                        val dateTime = exif.getAttribute(ExifInterface.TAG_DATETIME)
                        
                        val dateStr = dateTimeOriginal ?: dateTime
                        if (!dateStr.isNullOrEmpty()) {
                            val exifFormat = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.getDefault())
                            val date = exifFormat.parse(dateStr)
                            if (date != null) {
                                creationTime = date.time
                                // 既然能读取到 EXIF，说明这应该是最准确的时间
                                if (lastModified == 0L || Math.abs(lastModified - creationTime) > 1000) {
                                     // 可选：是否要更新 lastModified? 
                                     lastModified = creationTime 
                                }
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                } else if (videoExtensions.contains(extension)) {
                    val retriever = MediaMetadataRetriever()
                    retriever.setDataSource(filePath)
                    val widthStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                    val heightStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                    // 注意：这里可能需要处理视频旋转角度 (METADATA_KEY_VIDEO_ROTATION)
                    val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
                    
                    var w = widthStr?.toIntOrNull() ?: 0
                    var h = heightStr?.toIntOrNull() ?: 0
                    
                    if (rotation == "90" || rotation == "270") {
                        width = h
                        height = w
                    } else {
                        width = w
                        height = h
                    }
                    retriever.release()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
            
            val extension = file.extension.lowercase(Locale.getDefault())
            val mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)

            return FileInfo(lastModified, creationTime, size, width, height, mimeType, md5)
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
                val md5 = calculateMD5(context, uri)
                
                // 1. 尝试使用 ParcelFileDescriptor 获取 (最可靠的方式获取 mtime 和 size)
                try {
                    context.contentResolver.openFileDescriptor(uri, "r")?.use { pfd ->
                        val fd = pfd.fileDescriptor
                        val stat = Os.fstat(fd)
                        var lastModified = stat.st_mtime * 1000 // st_mtime is seconds
                        var creationTime = lastModified
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

                        // Keep creationTime aligned with the best timestamp we found above.
                        // For photo picker / gallery URIs, datetaken is usually the real capture time.
                        creationTime = lastModified

                        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
                        val dateStr = dateFormat.format(Date(lastModified))
                        val sizeStr = android.text.format.Formatter.formatFileSize(context, size)
                        
                        Log.d(TAG, "Got info via PFD + Cursor: mtime=$dateStr, size=$sizeStr")
                        
                        // 获取媒体宽高
                        var width = 0
                        var height = 0
                        var orientation = 0

                        // 1. 尝试使用 ExifInterface (针对图片，速度快且支持方向)
                        try {
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                                val exif = ExifInterface(fd)
                                val w = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0)
                                val h = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0)
                                orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)

                                // 尝试从 EXIF 获取拍摄时间
                                val dateTimeOriginal = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
                                val dateTime = exif.getAttribute(ExifInterface.TAG_DATETIME)
                                
                                val dateStr = dateTimeOriginal ?: dateTime
                                if (!dateStr.isNullOrEmpty()) {
                                    try {
                                        // EXIF 时间格式通常为 "yyyy:MM:dd HH:mm:ss"
                                        val exifFormat = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.getDefault())
                                        val date = exifFormat.parse(dateStr)
                                        if (date != null) {
                                            val exifTime = date.time
                                            Log.d(TAG, "Found creation time from EXIF: $exifTime ($dateStr)")
                                            // 如果是从 EXIF 获取的时间，优先作为创建时间和修改时间
                                            creationTime = exifTime
                                            // 如果当前 lastModified 看起来是文件系统时间（比如和现在很接近，或者和 EXIF 差距很大），
                                            // 或者仅仅是因为没有其他来源，我们可以信任 EXIF 时间
                                            if (lastModified == 0L || lastModified == stat.st_mtime * 1000) {
                                                lastModified = exifTime
                                            }
                                        }
                                    } catch (e: Exception) {
                                        Log.w(TAG, "Failed to parse EXIF date: $dateStr")
                                    }
                                }

                                if (w > 0 && h > 0) {
                                    if (orientation == ExifInterface.ORIENTATION_ROTATE_90 || 
                                        orientation == ExifInterface.ORIENTATION_ROTATE_270 ||
                                        orientation == ExifInterface.ORIENTATION_TRANSPOSE || 
                                        orientation == ExifInterface.ORIENTATION_TRANSVERSE) {
                                        width = h
                                        height = w
                                    } else {
                                        width = w
                                        height = h
                                    }
                                    Log.d(TAG, "Got dimensions via ExifInterface: ${width}x${height}")
                                }
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "ExifInterface failed: ${e.message}")
                        }

                        // 重置 FD 指针
                        try {
                            Os.lseek(fd, 0L, OsConstants.SEEK_SET)
                        } catch (e: Exception) {
                            // ignore
                        }

                        // 2. 如果还没获取到，尝试 MediaMetadataRetriever (视频 + 图片备选)
                        if (width == 0 || height == 0) {
                            try {
                                val retriever = MediaMetadataRetriever()
                                retriever.setDataSource(context, uri)
                                
                                val wStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH) 
                                    ?: retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_IMAGE_WIDTH)
                                val hStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                                    ?: retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_IMAGE_HEIGHT)
                                val rotStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
                                
                                var w = wStr?.toIntOrNull() ?: 0
                                var h = hStr?.toIntOrNull() ?: 0
                                
                                if (w > 0 && h > 0) {
                                    if (rotStr == "90" || rotStr == "270") {
                                        width = h
                                        height = w
                                    } else {
                                        width = w
                                        height = h
                                    }
                                    Log.d(TAG, "Got dimensions via MediaMetadataRetriever: ${width}x${height}")
                                }
                                retriever.release()
                            } catch (e: Exception) {
                                Log.w(TAG, "MediaMetadataRetriever failed: ${e.message}")
                            }
                        }

                        // 3. 最后尝试 BitmapFactory (图片兜底)
                        if (width == 0 || height == 0) {
                            try {
                                val options = BitmapFactory.Options()
                                options.inJustDecodeBounds = true
                                BitmapFactory.decodeFileDescriptor(fd, null, options)
                                width = options.outWidth
                                height = options.outHeight
                            } catch (e: Exception) {
                                Log.w(TAG, "BitmapFactory FD failed: ${e.message}")
                            }

                            if (width <= 0 || height <= 0) {
                                try {
                                    context.contentResolver.openInputStream(uri)?.use { stream ->
                                        val options = BitmapFactory.Options()
                                        options.inJustDecodeBounds = true
                                        BitmapFactory.decodeStream(stream, null, options)
                                        width = options.outWidth
                                        height = options.outHeight
                                    }
                                } catch (e: Exception) {
                                    Log.w(TAG, "BitmapFactory Stream failed: ${e.message}")
                                }
                            }
                            
                            if (width > 0 && height > 0) {
                                if (orientation == ExifInterface.ORIENTATION_ROTATE_90 || 
                                    orientation == ExifInterface.ORIENTATION_ROTATE_270 ||
                                    orientation == ExifInterface.ORIENTATION_TRANSPOSE || 
                                    orientation == ExifInterface.ORIENTATION_TRANSVERSE) {
                                    val temp = width
                                    width = height
                                    height = temp
                                }
                                Log.d(TAG, "Got dimensions via BitmapFactory: ${width}x${height}")
                            }
                        }

                        // 对于 content uri，creationTime 通常不可用，使用 lastModified
                        val mimeType = context.contentResolver.getType(uri)
                        Log.d(TAG, "Got info via PFD + Cursor: width=$width, height=$height, mimeType=$mimeType, md5=$md5")
                        return FileInfo(lastModified, creationTime, size, width, height, mimeType, md5)
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
                            // Cursor 方式暂时无法高效获取宽高，除非再次打开流
                            val mimeType = context.contentResolver.getType(uri)
                            return FileInfo(effectiveTime, effectiveTime, size, 0, 0, mimeType, md5)
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

    /**
     * 解析 QuickTime MOV/MP4 文件的 ContentIdentifier
     * Apple Live Photo 视频部分包含 com.apple.quicktime.content.identifier metadata
     */
    private fun extractQuickTimeContentId(file: File): String? {
        if (!file.exists() || file.length() < 32) return null
        try {
            file.inputStream().use { input ->
                val data = ByteArray(minOf(file.length(), 2 * 1024 * 1024L).toInt())
                val read = input.read(data)
                if (read <= 0) return null
                // 直接在前 2MB 中查找 com.apple.quicktime.content.identifier 关键字
                val key = "com.apple.quicktime.content.identifier".toByteArray(Charsets.US_ASCII)
                val idx = indexOf(data, key, 0, read)
                if (idx < 0) return null
                // ContentIdentifier 通常是 36 字节的 UUID 字符串，跳过 key 后再向后扫描可打印 ASCII
                var p = idx + key.size
                while (p < read && (data[p] < 0x20 || data[p] > 0x7E)) p++
                val start = p
                while (p < read && data[p] >= 0x20 && data[p] <= 0x7E) p++
                if (p - start >= 8) {
                    return String(data, start, p - start, Charsets.US_ASCII).trim()
                }
                return null
            }
        } catch (e: Exception) {
            Log.w(TAG, "extractQuickTimeContentId failed: ${e.message}")
            return null
        }
    }

    private fun indexOf(haystack: ByteArray, needle: ByteArray, fromIndex: Int, length: Int): Int {
        if (needle.isEmpty()) return fromIndex
        val end = length - needle.size
        var i = fromIndex
        while (i <= end) {
            var j = 0
            while (j < needle.size && haystack[i + j] == needle[j]) j++
            if (j == needle.size) return i
            i++
        }
        return -1
    }

    private fun queryDisplayName(context: Context, uri: Uri): String? {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) return cursor.getString(index)
            }
        }
        return null
    }

    private fun queryContentSize(context: Context, uri: Uri): Long? {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (index >= 0) {
                    val size = cursor.getLong(index)
                    if (size > 0) return size
                }
            }
        }
        return null
    }

    private fun buildLivePhotoJson(videoPath: String, contentId: String, duration: Long, videoSize: Long = 0): String {
        return JSONObject().apply {
            put("videoPath", videoPath)
            put("contentId", contentId)
            put("duration", duration)
            put("videoSize", videoSize)
        }.toString()
    }

    private fun probeVideoDuration(file: File): Long {
        return try {
            val retriever = MediaMetadataRetriever()
            retriever.setDataSource(file.absolutePath)
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L
            retriever.release()
            duration
        } catch (e: Exception) {
            Log.w(TAG, "probeVideoDuration path failed: ${e.message}")
            try {
                val retriever = MediaMetadataRetriever()
                java.io.RandomAccessFile(file, "r").use { raf ->
                    retriever.setDataSource(raf.fd)
                }
                val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                    ?.toLongOrNull() ?: 0L
                retriever.release()
                duration
            } catch (e2: Exception) {
                Log.w(TAG, "probeVideoDuration fd failed: ${e2.message}")
                0L
            }
        }
    }

    /** 检查文件指定偏移处是否为 MP4 ftyp box（允许 4 字节 size 前缀） */
    private fun hasFtypAtOffset(file: File, offset: Long): Boolean {
        if (offset < 0 || offset + 8 > file.length()) return false
        return try {
            val buf = ByteArray(8)
            java.io.RandomAccessFile(file, "r").use { raf ->
                raf.seek(offset)
                if (raf.read(buf) < 8) return false
            }
            val isFtyp = { start: Int ->
                buf[start] == 'f'.code.toByte()
                    && buf[start + 1] == 't'.code.toByte()
                    && buf[start + 2] == 'y'.code.toByte()
                    && buf[start + 3] == 'p'.code.toByte()
            }
            isFtyp(0) || isFtyp(4)
        } catch (e: Exception) {
            Log.w(TAG, "hasFtypAtOffset failed: ${e.message}")
            false
        }
    }

    private fun isValidCachedMp4(file: File, expectedLen: Long): Boolean {
        if (!file.exists() || file.length() != expectedLen) return false
        if (!hasFtypAtOffset(file, 0)) {
            Log.w(TAG, "cached mp4 missing ftyp header: ${file.absolutePath}")
            return false
        }
        return true
    }

    private fun writeMotionPhotoSlice(
        imgFile: File,
        outFile: File,
        videoOffset: Long,
        videoLen: Long,
    ): Boolean {
        return try {
            Log.i(TAG, "[MotionPhoto] writing slice to ${outFile.absolutePath} offset=$videoOffset len=$videoLen")
            java.io.RandomAccessFile(imgFile, "r").use { raf ->
                raf.seek(videoOffset)
                var remaining = videoLen
                outFile.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (remaining > 0) {
                        val toRead = minOf(buf.size.toLong(), remaining).toInt()
                        val r = raf.read(buf, 0, toRead)
                        if (r <= 0) break
                        out.write(buf, 0, r)
                        remaining -= r
                    }
                }
            }
            val written = outFile.length()
            if (written != videoLen) {
                Log.w(TAG, "[MotionPhoto] write size mismatch: wrote=$written expected=$videoLen")
            }
            written == videoLen
        } catch (e: Exception) {
            Log.w(TAG, "writeMotionPhotoSlice failed: ${e.message}")
            false
        }
    }

    /** 综合 XMP 与 ftyp 扫描，选择可验证的 Motion Photo 切片 */
    private fun resolveMotionPhotoSlice(imgFile: File): MotionPhotoSlice? {
        val fileLen = imgFile.length()
        val candidates = mutableListOf<MotionPhotoSlice>()
        candidates.addAll(parseMotionPhotoSlice(imgFile))

        val ftypOffset = scanForMp4FtypOffset(imgFile)
        if (ftypOffset != null) {
            candidates.add(MotionPhotoSlice(ftypOffset, fileLen - ftypOffset))
        }

        for (candidate in candidates.distinctBy { "${it.offset}:${it.length}" }) {
            if (candidate.offset < 0 || candidate.length <= 0) continue
            if (candidate.offset + candidate.length > fileLen) continue
            if (hasFtypAtOffset(imgFile, candidate.offset)) {
                Log.i(TAG, "[MotionPhoto] picked slice offset=${candidate.offset} len=${candidate.length}")
                return candidate
            }
            Log.w(TAG, "[MotionPhoto] reject slice without ftyp offset=${candidate.offset} len=${candidate.length}")
        }

        return null
    }

    private fun copyContentUriToCache(context: Context, uri: Uri, subDir: String, fileName: String? = null): String? {
        try {
            val cacheDir = File(context.cacheDir, subDir)
            if (!cacheDir.exists()) cacheDir.mkdirs()
            val displayName = fileName ?: queryDisplayName(context, uri) ?: "import_${System.currentTimeMillis()}.jpg"
            val outFile = File(cacheDir, displayName.replace(Regex("""[^\w.\-]"""), "_"))
            val needsCopy = !outFile.exists() || outFile.length() == 0L
            if (needsCopy) {
                if (outFile.exists()) outFile.delete()
                context.contentResolver.openInputStream(uri)?.use { input ->
                    outFile.outputStream().use { output -> input.copyTo(output) }
                } ?: return null
                Log.i(TAG, "copied content uri to ${outFile.absolutePath} size=${outFile.length()}")
            }
            if (subDir == "live_photo_import") {
                cleanupCacheDir(cacheDir, maxFiles = 30, maxBytes = 100L * 1024 * 1024)
            }
            return outFile.absolutePath
        } catch (e: Exception) {
            Log.w(TAG, "copyContentUriToCache failed: ${e.message}")
            return null
        }
    }

    private fun cleanupCacheDir(cacheRoot: File, maxFiles: Int, maxBytes: Long) {
        val files = cacheRoot.listFiles()?.sortedByDescending { it.lastModified() } ?: return
        var totalSize = files.sumOf { it.length() }
        files.drop(maxFiles).forEach { file ->
            totalSize -= file.length()
            file.delete()
        }
        if (totalSize > maxBytes) {
            files.sortedBy { it.lastModified() }.forEach { file ->
                if (totalSize <= maxBytes) return
                if (file.exists()) {
                    totalSize -= file.length()
                    file.delete()
                }
            }
        }
    }

    private fun findMediaStoreVideoByName(context: Context, videoName: String): File? {
        val projection = arrayOf(MediaStore.Video.Media._ID)
        val selection = "${MediaStore.Video.Media.DISPLAY_NAME} = ?"
        context.contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            selection,
            arrayOf(videoName),
            null
        )?.use { cursor ->
            if (cursor.moveToFirst()) {
                val id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID))
                val videoUri = Uri.withAppendedPath(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id.toString())
                val localPath = copyContentUriToCache(context, videoUri, "live_video_cache", videoName)
                if (localPath != null) return File(localPath)
            }
        }
        return null
    }

    private fun findLivePhotoFromContentUri(context: Context, imagePath: String): String? {
        val imageUri = Uri.parse(imagePath)
        val displayName = queryDisplayName(context, imageUri)
        if (displayName != null) {
            val baseName = displayName.substringBeforeLast('.', displayName)
            for (ext in listOf("MOV", "mov", "MP4", "mp4")) {
                val videoFile = findMediaStoreVideoByName(context, "$baseName.$ext")
                if (videoFile != null && videoFile.exists()) {
                    val contentId = extractQuickTimeContentId(videoFile) ?: ""
                    val duration = probeVideoDuration(videoFile)
                    Log.i(TAG, "[LivePhoto] MediaStore Apple pair: ${videoFile.absolutePath}")
                    return buildLivePhotoJson(videoFile.absolutePath, contentId, duration, videoFile.length())
                }
            }
        }
        val localPath = copyContentUriToCache(context, imageUri, "live_photo_import") ?: return null
        return findMotionPhotoVideo(context, localPath)
    }

    /**
     * 给定一张图片的本地路径，尝试在同目录寻找同名 .MOV/.mp4 作为 Live Photo 动态部分。
     * 返回 JSON 字符串: {"videoPath":"...","contentId":"...","duration":1500}
     * 若无配对，返回 null。
     *
     * 需要 Context：当 Apple Live Photo 配对失败时，会尝试 Motion Photo 嵌入解析，
     * 解析切分出的视频片段需要写入 context.cacheDir。
     */
    @JvmStatic
    fun findLivePhotoVideo(context: Context, imagePath: String): String? {
        try {
            Log.i(TAG, "[LivePhoto] findLivePhotoVideo: $imagePath")
            if (imagePath.startsWith("content://")) {
                return findLivePhotoFromContentUri(context, imagePath)
            }
            val imgFile = File(imagePath)
            if (!imgFile.exists()) {
                Log.w(TAG, "[LivePhoto] image not exists: $imagePath")
                return null
            }
            val dir = imgFile.parentFile
            val baseName = imgFile.nameWithoutExtension
            val candidates = listOf("MOV", "mov", "MP4", "mp4")
            var videoFile: File? = null
            if (dir != null) {
                for (ext in candidates) {
                    val f = File(dir, "$baseName.$ext")
                    if (f.exists()) {
                        videoFile = f
                        break
                    }
                }
            }
            if (videoFile == null) {
                Log.i(TAG, "[LivePhoto] no Apple pair found, try Motion Photo for $imagePath")
                return findMotionPhotoVideo(context, imagePath)
            }

            Log.i(TAG, "[LivePhoto] Apple pair video: ${videoFile.absolutePath} size=${videoFile.length()}")
            val contentId = extractQuickTimeContentId(videoFile) ?: ""
            val duration = probeVideoDuration(videoFile)
            val result = buildLivePhotoJson(videoFile.absolutePath, contentId, duration, videoFile.length())
            Log.i(TAG, "[LivePhoto] Apple result: $result")
            return result
        } catch (e: Exception) {
            Log.w(TAG, "findLivePhotoVideo failed: ${e.message}")
            return null
        }
    }

    /**
     * Google / 小米 / 华为 Motion Photo（单文件嵌入 MP4）解析。
     * 流程：
     *  1. 扫描 JPEG 前 512KB 的 XMP 段，查找 GCamera:MotionPhoto/MicroVideo/Container:Item Length
     *  2. 计算 MP4 在文件中的偏移（fileLen - videoLen，或定位 ftyp box）
     *  3. 切分写入应用缓存目录 motion_photo_cache/
     *  4. 返回 JSON：videoPath / contentId（motion-photo:<name>）/ duration
     */
    @JvmStatic
    fun findMotionPhotoVideo(context: Context, imagePath: String): String? {
        try {
            Log.i(TAG, "[MotionPhoto] start: $imagePath")
            val imgFile = if (imagePath.startsWith("content://")) {
                val localPath = copyContentUriToCache(context, Uri.parse(imagePath), "live_photo_import") ?: return null
                File(localPath)
            } else {
                File(imagePath)
            }
            if (!imgFile.exists() || imgFile.length() < 64 * 1024) {
                Log.i(TAG, "[MotionPhoto] file missing or too small: exists=${imgFile.exists()} size=${imgFile.length()}")
                return null
            }

            val ext = imgFile.extension.lowercase(Locale.getDefault())
            if (ext != "jpg" && ext != "jpeg") {
                Log.i(TAG, "[MotionPhoto] skip non-jpg ext=$ext")
                return null
            }

            val fileLen = imgFile.length()
            val slice = resolveMotionPhotoSlice(imgFile) ?: run {
                Log.i(TAG, "[MotionPhoto] no valid slice found, fileLen=$fileLen")
                return null
            }
            val videoOffset = slice.offset
            val videoLen = slice.length
            Log.i(TAG, "[MotionPhoto] resolved offset=$videoOffset len=$videoLen fileLen=$fileLen")
            if (videoLen <= 0 || videoLen >= fileLen || videoOffset < 0) {
                Log.w(TAG, "[MotionPhoto] invalid slice: offset=$videoOffset len=$videoLen vs fileLen=$fileLen")
                return null
            }

            val cacheRoot = File(context.cacheDir, "motion_photo_cache")
            if (!cacheRoot.exists()) cacheRoot.mkdirs()
            val outFile = File(cacheRoot, "${imgFile.nameWithoutExtension}.live.mp4")

            val cacheValid = isValidCachedMp4(outFile, videoLen)
            if (!cacheValid) {
                if (outFile.exists()) {
                    Log.i(TAG, "[MotionPhoto] invalidate stale cache ${outFile.absolutePath}")
                    outFile.delete()
                }
                if (!writeMotionPhotoSlice(imgFile, outFile, videoOffset, videoLen)) {
                    return null
                }
            } else {
                Log.i(TAG, "[MotionPhoto] reuse validated cache ${outFile.absolutePath} len=${outFile.length()}")
            }
            cleanupCacheDir(cacheRoot, maxFiles = 50, maxBytes = 200L * 1024 * 1024)

            if (!hasFtypAtOffset(outFile, 0)) {
                Log.w(TAG, "[MotionPhoto] output missing ftyp header: ${outFile.absolutePath}")
                outFile.delete()
                return null
            }

            val duration = probeVideoDuration(outFile)
            Log.i(TAG, "[MotionPhoto] duration=$duration size=${outFile.length()}")
            val result = buildLivePhotoJson(
                outFile.absolutePath,
                "motion-photo:${imgFile.nameWithoutExtension}",
                duration,
                outFile.length()
            )
            Log.i(TAG, "[MotionPhoto] ✅ result: $result")
            return result
        } catch (e: Exception) {
            Log.w(TAG, "findMotionPhotoVideo failed: ${e.message}")
            return null
        }
    }

    private data class MotionPhotoSlice(val offset: Long, val length: Long)

    /**
     * 从 XMP 解析 Motion Photo 候选切片。
     *
     * - 小米 / 旧版 Pixel MicroVideo：MicroVideoOffset = 从文件尾算起的视频字节数，起点 = fileLen - value
     * - Google Motion Photo v1+：MicroVideoOffset = 从文件头算起的视频起点
     * - Container:Item Length = 尾部嵌入 MP4 的字节长度
     */
    private fun parseMotionPhotoSlice(file: File): List<MotionPhotoSlice> {
        val candidates = mutableListOf<MotionPhotoSlice>()
        try {
            val fileLen = file.length()
            val limit = minOf(fileLen, 512L * 1024).toInt()
            val data = ByteArray(limit)
            file.inputStream().use { it.read(data) }
            val text = String(data, Charsets.US_ASCII)

            val microOffsetRegex = Regex("""(?:GCamera:)?(?:MicroVideoOffset|VideoOffset)\s*=\s*"(\d+)"""")
            microOffsetRegex.find(text)?.groupValues?.getOrNull(1)?.toLongOrNull()?.let { microValue ->
                if (microValue > 0 && microValue < fileLen) {
                    // 小米 MVIMG：MicroVideoOffset 表示尾部视频长度
                    candidates.add(MotionPhotoSlice(fileLen - microValue, microValue))

                    // 部分机型：MicroVideoOffset 表示从文件头到视频起点的偏移
                    val microLenRegex = Regex("""(?:GCamera:)?MicroVideoLength\s*=\s*"(\d+)"""")
                    val explicitLen = microLenRegex.find(text)?.groupValues?.getOrNull(1)?.toLongOrNull()
                    val lenFromStart = explicitLen ?: (fileLen - microValue)
                    if (lenFromStart > 0 && microValue + lenFromStart <= fileLen) {
                        candidates.add(MotionPhotoSlice(microValue, lenFromStart))
                    }
                }
            }

            val itemRegex = Regex(
                """Item[^>]*Mime\s*=\s*"video/mp4"[^>]*Length\s*=\s*"(\d+)"""",
                RegexOption.DOT_MATCHES_ALL
            )
            itemRegex.find(text)?.groupValues?.getOrNull(1)?.toLongOrNull()?.let { length ->
                if (length > 0 && length < fileLen) {
                    candidates.add(MotionPhotoSlice(fileLen - length, length))
                }
            }
            val itemRegex2 = Regex(
                """Item[^>]*Length\s*=\s*"(\d+)"[^>]*Mime\s*=\s*"video/mp4"""",
                RegexOption.DOT_MATCHES_ALL
            )
            itemRegex2.find(text)?.groupValues?.getOrNull(1)?.toLongOrNull()?.let { length ->
                if (length > 0 && length < fileLen) {
                    candidates.add(MotionPhotoSlice(fileLen - length, length))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "parseMotionPhotoSlice failed: ${e.message}")
        }
        return candidates
    }

    /**
     * 扫描 mp4 ftyp box，返回 box 起始绝对偏移（含 4 字节 size 前缀）。
     * 从 512KB 处开始扫描，覆盖小米 MVIMG 等较早嵌入的视频起点。
     */
    private fun scanForMp4FtypOffset(file: File): Long? {
        try {
            val len = file.length()
            if (len < 256 * 1024) return null
            val startFrom = 512L * 1024
            val chunkSize = 256 * 1024
            java.io.RandomAccessFile(file, "r").use { raf ->
                raf.seek(startFrom)
                val buf = ByteArray(chunkSize)
                var absolute = startFrom
                var read = raf.read(buf)
                while (read > 0) {
                    var i = 0
                    while (i < read - 4) {
                        if (buf[i] == 'f'.code.toByte()
                            && buf[i + 1] == 't'.code.toByte()
                            && buf[i + 2] == 'y'.code.toByte()
                            && buf[i + 3] == 'p'.code.toByte()
                        ) {
                            val boxStart = absolute + i - 4
                            if (boxStart > 0 && hasFtypAtOffset(file, boxStart)) {
                                Log.i(TAG, "[MotionPhoto] ftyp found at $boxStart")
                                return boxStart
                            }
                        }
                        i++
                    }
                    absolute += read
                    read = raf.read(buf)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "scanForMp4FtypOffset failed: ${e.message}")
        }
        return null
    }
}
