// db.js
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',           
  database: 'tech_kds',
  port: 3306
});

pool.getConnection((err, conn) => {
  if (err) {
    console.error('MySQL baglanti hatasi:', err);
  } else {
    console.log('MySQL baglanti basarili.');
    conn.release();
  }
});

module.exports = pool.promise();
