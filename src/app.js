const express = require('express');
const path = require('path');
const session = require('express-session');
const webRoutes = require('./routes/web');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); 

const app = express();
const PORT = process.env.PORT || 3000;

// View Engine 
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'gizli_anahtar',
    resave: false,
    saveUninitialized: true
}));


app.use('/', webRoutes);

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});




