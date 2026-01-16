import { ObjectId } from 'mongodb'

 export function getUniqueKey() {
  return new ObjectId().toHexString()
}
