
import mongoose from 'mongoose'
import { MongoClient } from 'mongodb'
import { Weight } from '../src/db/weight'
import { Family } from '../src/db/family'

// Old database config
const OLD_DB_URI = process.env.OLD_DB_URI || 'mongodb://localhost:27017'
const OLD_DB_NAME = process.env.OLD_DB_NAME || 'time-lover'

// New database config (assumed to be connected via mongoose in main app, but here we connect manually)
const NEW_DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/echo-trails'

interface MigrateOptions {
  oldPhone: string
  newUsername: string
  operator: string
}

async function connectToNewDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(NEW_DB_URI)
    console.log('Connected to new database')
  }
}

async function migrate({ oldPhone, newUsername, operator }: MigrateOptions) {
  console.log(`Starting migration for phone: ${oldPhone} -> username: ${newUsername}`)

  // 1. Connect to old database
  const oldClient = new MongoClient(OLD_DB_URI)
  await oldClient.connect()
  const oldDb = oldClient.db(OLD_DB_NAME)
  console.log('Connected to old database')

  try {
    await connectToNewDb()

    // 2. Find old user
    const oldUser = await oldDb.collection('user').findOne({ phone: oldPhone })
    if (!oldUser) {
      console.error(`Old user with phone ${oldPhone} not found`)
      return
    }
    const oldUserId = oldUser.userId
    console.log(`Found old user ID: ${oldUserId}`)

    // 3. Migrate Families
    const oldFamilies = await oldDb.collection('family').find({
      userId: oldUserId,
      deleted: { $ne: true }
    }).toArray()

    console.log(`Found ${oldFamilies.length} families to migrate`)

    const familyIdMap = new Map<string, string>()

    for (const oldFamily of oldFamilies) {
      // Check if already exists (optional, but good for idempotency)
      // Assuming we just create new ones or update if familyId matches?
      // Since familyId is string in new DB, we can reuse or generate new.
      // Let's try to reuse familyId if possible, or mapping is needed if we want to change ID format.
      // Old familyId seems to be string as well.

      const newFamilyData = {
        familyId: oldFamily.familyId,
        name: oldFamily.name,
        username: newUsername,
        // Preserve creation time if available, else now
        createdAt: oldFamily._id.getTimestamp(),
        updatedAt: new Date()
      }

      // Upsert to avoid duplicates if run multiple times
      await Family.findOneAndUpdate(
        { familyId: oldFamily.familyId, username: newUsername },
        newFamilyData,
        { upsert: true, new: true }
      )

      familyIdMap.set(oldFamily.familyId, oldFamily.familyId)
      console.log(`Migrated family: ${oldFamily.name} (${oldFamily.familyId})`)
    }

    // 4. Migrate Weight Records
    const oldRecords = await oldDb.collection('record').find({
      userId: oldUserId,
      deleted: { $ne: true }
    }).toArray()

    console.log(`Found ${oldRecords.length} weight records to migrate`)

    let migratedCount = 0
    for (const oldRecord of oldRecords) {
      if (!oldRecord.weight || !oldRecord.date) {
        console.warn(`Skipping invalid record: ${oldRecord.recordId}`)
        continue
      }

      // If record has familyId, check if we migrated that family
      // If familyId is missing or not in map (and not default/self?), handle it.
      // In old DB, records might be linked to user directly or via family.
      // New DB requires familyId.
      // If old record has familyId, use it. If not, maybe it belongs to 'default' or user themselves?
      // Assuming if familyId is present in old record, it maps to the migrated family.

      let targetFamilyId = oldRecord.familyId

      // If old record didn't have familyId, it might be for the user themselves.
      // In new system, we might represent self as a specific familyId or handle 'default'.
      // Based on previous code analysis, 'default' is used in UI.
      if (!targetFamilyId) {
          targetFamilyId = 'default'
      }

      const newRecordData = {
        username: newUsername,
        operator: operator,
        familyId: targetFamilyId,
        weight: oldRecord.weight,
        date: new Date(oldRecord.date),
        tips: oldRecord.tips || '',
        createdAt: oldRecord._id.getTimestamp(),
        updatedAt: new Date()
      }

       // Check for existing to avoid duplicates (by date and familyId and username?)
       // Or just insert? Let's use update with upsert based on some unique criteria if possible.
       // But weight records might not have unique IDs that are preserved easily unless we store old ID.
       // Let's assume we just insert for now, or check if exact same record exists.

       const exists = await Weight.findOne({
         username: newUsername,
         familyId: targetFamilyId,
         date: newRecordData.date,
         weight: newRecordData.weight
       })

       if (!exists) {
         await Weight.create(newRecordData)
         migratedCount++
       } else {
           // console.log('Skipping duplicate record')
       }
    }

    console.log(`Successfully migrated ${migratedCount} weight records`)

  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await oldClient.close()
    await mongoose.connection.close()
    console.log('Migration finished')
  }
}

// CLI usage
// tsx scripts/migrate.ts <oldPhone> <newUsername> <operator>
const args = process.argv.slice(2)
if (args.length < 3) {
  console.log('Usage: tsx scripts/migrate.ts <oldPhone> <newUsername> <operator>')
  process.exit(1)
}

const [oldPhone, newUsername, operator] = args

migrate({ oldPhone, newUsername, operator })
