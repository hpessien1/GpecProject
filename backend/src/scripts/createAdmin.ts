// Creates an admin account, or resets an admin's password, and prints a new random password once.
// There is no sign-up page: this command is the only way to create an admin.
//
//   npm run admin:create -- --email staff@example.com --name "Full Name"     (development, gpec_dev)
//   npm run admin:create -- --email staff@example.com --reset                (new password, ends sessions)
//   node dist/scripts/createAdmin.js --email ... --name ... --production     (production image)
import 'dotenv/config'
import { parseArgs } from 'node:util'
import mongoose from 'mongoose'
import { loadConfig } from '../config.js'
import AdminSession from '../models/AdminSession.js'
import AdminUser from '../models/AdminUser.js'
import { generatePassword, hashPassword } from '../services/passwords.js'
import { emailPattern } from '../validation/fields.js'

const PRODUCTION_DATABASE = 'gpec'

try {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      reset: { type: 'boolean', default: false },
      production: { type: 'boolean', default: false },
    },
  })
  const email = values.email?.trim().toLowerCase() ?? ''
  const name = values.name?.trim() ?? ''
  if (!emailPattern.test(email)) throw new Error('Give a valid --email.')
  if (!values.reset && !name) throw new Error('Give the admin\'s --name (in quotes if it has spaces).')

  const config = loadConfig()
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
  const databaseName = mongoose.connection.name
  if (databaseName === PRODUCTION_DATABASE && !values.production) {
    throw new Error(`Refusing to change admins in the production "${PRODUCTION_DATABASE}" database without --production.`)
  }

  const password = generatePassword()
  const passwordHash = await hashPassword(password)
  if (values.reset) {
    const admin = await AdminUser.findOneAndUpdate({ email }, { passwordHash }, { new: true })
    if (!admin) throw new Error(`No admin with email ${email}.`)
    // A reset usually means the old password may be known to someone else: log out everywhere.
    await AdminSession.deleteMany({ admin: admin._id })
    console.log(`Database "${databaseName}": password reset for ${email}; all of their sessions were ended.`)
  } else {
    if (await AdminUser.exists({ email })) throw new Error(`An admin with email ${email} already exists. Use --reset to give them a new password.`)
    await AdminUser.create({ email, name, passwordHash })
    console.log(`Database "${databaseName}": admin created for ${name} <${email}>.`)
  }
  // Shown once and never stored in readable form. Pass it to the admin privately.
  console.log(`Password: ${password}`)
  await mongoose.disconnect()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  await mongoose.disconnect()
  process.exit(1)
}
