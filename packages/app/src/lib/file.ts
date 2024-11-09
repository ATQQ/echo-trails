export function generateFileKey(fileInfo: {
  file: any;
  objectUrl: any;
  name: string;
  lastModified: number;
  date: Date;
  exifData: ExifReader.Tags;
}) {
  // 年-月-日/时分/上传时间-文件名
  const year = fileInfo.date.getFullYear();
  const month = (fileInfo.date.getMonth() + 1).toString().padStart(2, '0');
  const day = fileInfo.date.getDate().toString().padStart(2, '0');
  const hour = fileInfo.date.getHours().toString().padStart(2, '0');
  const minute = fileInfo.date.getMinutes().toString().padStart(2, '0');
  const uploadTime = new Date().getTime()

  return `${import.meta.env.VITE_S3_PREFIX}/${year}-${month}-${day}/${hour}-${minute}/${uploadTime}-${fileInfo.name}`
}


export function formatSize(
  size: number,
  pointLength?: number,
  units?: string[],
) {
  let unit
  units = units || ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  // eslint-disable-next-line no-cond-assign
  while ((unit = units.shift()) && size > 1024) {
    size /= 1024
  }
  return (
    (unit === 'B'
      ? size
      : size.toFixed(pointLength === undefined ? 2 : pointLength)) + unit!
  )
}
