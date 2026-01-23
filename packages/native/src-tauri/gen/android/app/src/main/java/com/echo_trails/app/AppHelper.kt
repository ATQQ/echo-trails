package com.echo_trails.app

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

object AppHelper {
    @JvmStatic
    fun installApk(context: Context, filePath: String) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                return
            }

            val authority = context.packageName + ".fileprovider"
            val uri = FileProvider.getUriForFile(context, authority, file)

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
