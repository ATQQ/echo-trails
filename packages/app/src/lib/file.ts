export function generateFileKey(fileInfo: {
  file: any;
  objectUrl: any;
  name: string;
  lastModified: number;
  date: Date;
  exifData: ExifReader.Tags;
}){
  console.log(fileInfo);
  // 年-月-日/时分/上传时间-文件名
  const year = fileInfo.date.getFullYear();
  const month = (fileInfo.date.getMonth() + 1).toString().padStart(2, '0');
  const day = fileInfo.date.getDate().toString().padStart(2, '0');
  const hour = fileInfo.date.getHours().toString().padStart(2, '0');
  const minute = fileInfo.date.getMinutes().toString().padStart(2, '0');
  const uploadTime = new Date().getTime()
  return `${year}-${month}-${day}/${hour}-${minute}/${uploadTime}-${fileInfo.name}`
}
