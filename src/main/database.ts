import Database from 'better-sqlite3'
import { app } from 'electron'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { statSync, existsSync, readdirSync, unlinkSync, copyFileSync, mkdirSync } from 'fs'

const DB_PATH = join(app.getPath('userData'), 'hp-pos.db')
const BACKUP_DIR = join(app.getPath('userData'), 'backups')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

export function runMigrations() {
  const schemaPath = join(__dirname, '..', '..', 'src', 'main', 'schema.sql')
  const altSchemaPath = join(dirname(require?.main?.filename || ''), '..', 'src', 'main', 'schema.sql')

  let schemaContent: string

  if (existsSync(schemaPath)) {
    schemaContent = readFileSync(schemaPath, 'utf-8')
  } else if (existsSync(altSchemaPath)) {
    schemaContent = readFileSync(altSchemaPath, 'utf-8')
  } else {
    // In production, schema.sql is bundled alongside the main process
    // Try relative to the built app
    const bundlePath = join(app.getAppPath(), 'src', 'main', 'schema.sql')
    if (existsSync(bundlePath)) {
      schemaContent = readFileSync(bundlePath, 'utf-8')
    } else {
      throw new Error('Could not find schema.sql')
    }
  }

  const database = getDb()
  database.exec(schemaContent)

  // Seed bill counter if not exists
  const counter = database.prepare('SELECT COUNT(*) as c FROM bill_counter WHERE id = 1').get() as { c: number }
  if (counter.c === 0) {
    database.prepare("INSERT INTO bill_counter (id, prefix, next_number) VALUES (1, 'BILL', 1)").run()
  }

  // Seed default password
  const hasPassword = database.prepare("SELECT COUNT(*) as c FROM settings WHERE key = 'dashboard_password'").get() as { c: number }
  if (hasPassword.c === 0) {
    database.prepare("INSERT INTO settings (key, value) VALUES ('dashboard_password', 'khevji')").run()
  }

  // Seed default agency info
  const defaults = [
    ['agency_name', 'HP Gas Agency'],
    ['agency_address', ''],
    ['agency_phone', ''],
    ['agency_gstin', ''],
    ['bill_prefix', 'BILL'],
    ['bill_footer', 'Thank you for your business!'],
  ]
  for (const [key, value] of defaults) {
    const exists = database.prepare('SELECT COUNT(*) as c FROM settings WHERE key = ?').get(key) as { c: number }
    if (exists.c === 0) {
      database.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value)
    }
  }
}

export function runBackup() {
  if (!existsSync(DB_PATH)) return

  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const date = new Date().toISOString().slice(0, 10)
  const backupFile = join(BACKUP_DIR, `hp-pos-${date}.db`)

  // Skip if today's backup already exists
  if (existsSync(backupFile)) return

  copyFileSync(DB_PATH, backupFile)

  // Rotate: keep only last 7 backups
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort()

  while (files.length > 7) {
    const oldest = files.shift()!
    unlinkSync(join(BACKUP_DIR, oldest))
  }
}

export function listBackups(): string[] {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort()
    .reverse()
}

export function restoreBackup(backupFile: string) {
  const backupPath = join(BACKUP_DIR, backupFile)
  if (!existsSync(backupPath)) throw new Error('Backup file not found')

  if (db) {
    db.close()
    db = null
  }
  copyFileSync(backupPath, DB_PATH)
  return true
}
