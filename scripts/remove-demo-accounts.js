#!/usr/bin/env node
require("dotenv").config({path:process.env.ENV_FILE||undefined});
const path=require("path");
const Database=require("better-sqlite3");
const db=new Database(path.join(__dirname,"..","server","data","ridgefield.db"));
const accounts=db.prepare("SELECT id,email FROM auth_accounts WHERE email LIKE '%@ridgefield.local'").all();
for(const a of accounts){
  db.prepare("DELETE FROM auth_sessions WHERE account_id=?").run(a.id);
  db.prepare("DELETE FROM parent_students WHERE parent_id=?").run(a.id);
  db.prepare("DELETE FROM auth_accounts WHERE id=?").run(a.id);
}
console.log(`Removed ${accounts.length} demo/local account(s).`);
