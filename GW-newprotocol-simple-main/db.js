import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

export async function connect() {
  try {
    await sql.connect(config);
    console.log('Connected on SQL Server');
  } catch (err) {
    console.error('Error on SQL Server:', err);
  }
}

export const pool = new sql.ConnectionPool(config);
export const sqlIns = sql;
