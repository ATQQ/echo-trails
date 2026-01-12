package com.echo_trails.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import android.content.Context
import android.content.Intent
import android.net.Uri

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  companion object {
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
