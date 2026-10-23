import mongoose from 'mongoose'

// The one record of GPEC's bank account for customers who pay by bank transfer, managed by staff in
// the admin panel (every change recorded and emailed to the admins: a quietly changed account number
// would send customers' money elsewhere). Its _id is always BANK_TRANSFER_SETTINGS_ID.
export const BANK_TRANSFER_SETTINGS_ID = 'bank-transfer'

const bankTransferSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: BANK_TRANSFER_SETTINGS_ID, enum: [BANK_TRANSFER_SETTINGS_ID] },
  // Customers see the option at checkout only while this is on and the details are complete.
  enabled: { type: Boolean, default: false },
  bankName: { type: String, trim: true, maxlength: 120, default: '' },
  accountName: { type: String, trim: true, maxlength: 120, default: '' },
  // A Nigerian NUBAN account number: 10 digits.
  accountNumber: { type: String, trim: true, match: /^(\d{10})?$/, default: '' },
  // Anything else customers should know, e.g. "Send proof of payment to …".
  instructions: { type: String, trim: true, maxlength: 500, default: '' },
  // How many days customers are asked to pay within. Staff close unpaid orders by hand after that.
  payWithinDays: { type: Number, min: 1, max: 30, default: 3, validate: { validator: Number.isInteger, message: 'payWithinDays must be a whole number.' } },
}, { timestamps: true, strict: 'throw' })

export default mongoose.model('BankTransferSettings', bankTransferSettingsSchema)
