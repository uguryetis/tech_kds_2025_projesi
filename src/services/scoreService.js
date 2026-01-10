const db = require('../config/db');

const BRANCHES = [
  { key: 'gaziemir',  id: 1, name: 'Gaziemir',  color: '#2ecc71' }, 
  { key: 'bayrakli',  id: 2, name: 'Bayraklı',  color: '#3498db' }, 
  { key: 'karsiyaka', id: 3, name: 'Karşıyaka', color: '#95a5a6' }, 
  { key: 'urla',      id: 4, name: 'Urla',      color: '#f39c12' }, 
  { key: 'selcuk',    id: 5, name: 'Selçuk',    color: '#e74c3c' }, 
];

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];


function rgbaForBranch(key) {
  switch (key) {
    case 'gaziemir':  return 'rgba(46, 204, 113, 0.2)';
    case 'bayrakli':  return 'rgba(52, 152, 219, 0.2)';
    case 'karsiyaka': return 'rgba(149, 165, 166, 0.2)';
    case 'urla':      return 'rgba(243, 156, 18, 0.2)';
    case 'selcuk':    return 'rgba(231, 76, 60, 0.2)';
    default:          return 'rgba(149, 165, 166, 0.2)';
  }
}

function hesaplaRawPuanlar(branchDataList, toplamMusteriAy, opts = {}) {
  const stokFactor = opts.stokFactor || 1;
  const netKarFactor = opts.netKarFactor || 1;
  const rawPoints = [];

  branchDataList.forEach((b) => {
    let puan = 0;
    for (let ay = 1; ay <= 6; ay++) {
      const m = b.months[ay] || {};
      const ciro = Number(m.ciro) || 0;
      const netKar = (Number(m.netKar) || 0) * netKarFactor;
      const musteri = Number(m.musteri) || 0;
      let stokGun = Number(m.stokGun) || 0;
      stokGun = stokGun * stokFactor;

      const toplamM = toplamMusteriAy[ay] || 0;
      const oran = toplamM > 0 ? (musteri / toplamM) * 100 : 0;

      if (ciro > 200) puan += 2 + (ciro > 500 ? 1 : 0);
      if (netKar > 0) puan += 4 + (netKar > 50 ? 1 : 0);
      if (oran >= 10) puan += 2 + (oran >= 25 ? 1 : 0);
      if (stokGun > 0 && stokGun < 60) puan += 2 + (stokGun < 45 ? 1 : 0);
    }
    rawPoints.push(puan);
  });
  return rawPoints;
}

function skorlaraDonustur(rawPoints) {
  const maxPossible = 84;
  const skorlar = rawPoints.map((p) => Math.round((p / maxPossible) * 100));
  const durumEtiketleri = new Array(skorlar.length);

  const sirali = skorlar.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);
  
  sirali.forEach(({ i }, rank) => {
    let durum;
    if (rank === 0) durum = 'Başarılı (Model Alınmalı)';
    else if (rank === 1) durum = 'İyi (Geliştirilmeli)';
    else if (rank === 2) durum = 'İzlenmeli (İyileştirilmeli)';
    else durum = 'Kritik! (Kapatılması Gerekebilir!)';
    durumEtiketleri[i] = durum;
  });

  return { skorlar, durumEtiketleri };
}

async function hesaplaSubeSkorlari(yil) {
  const [perfRows] = await db.query(
    `SELECT s.sube_id, s.sube_adi, p.ay, p.ciro_milyon, p.net_kar_milyon, p.musteri_sayisi
     FROM sube_aylik_performans p JOIN sube s ON p.sube_id = s.sube_id
     WHERE p.yil = ? ORDER BY s.sube_id, p.ay`, [yil]
  );

  const [stokRows] = await db.query(
    `SELECT s.sube_id, s.sube_adi, ss.ay, ss.stok_gun
     FROM sube_stok_kullanim ss JOIN sube s ON ss.sube_id = s.sube_id
     WHERE ss.yil = ? ORDER BY s.sube_id, ss.ay`, [yil]
  );

  const branchMap = new Map();
  BRANCHES.forEach((b) => branchMap.set(b.id, { id: b.id, name: b.name, months: {} }));
  const toplamMusteriAy = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  perfRows.forEach((r) => {
    const b = branchMap.get(r.sube_id);
    if (!b) return;
    if (!b.months[r.ay]) b.months[r.ay] = {};
    b.months[r.ay].ciro = Number(r.ciro_milyon) || 0;
    b.months[r.ay].netKar = Number(r.net_kar_milyon) || 0;
    b.months[r.ay].musteri = Number(r.musteri_sayisi) || 0;
    toplamMusteriAy[r.ay] += Number(r.musteri_sayisi) || 0;
  });

  stokRows.forEach((r) => {
    const b = branchMap.get(r.sube_id);
    if (!b) return;
    if (!b.months[r.ay]) b.months[r.ay] = {};
    b.months[r.ay].stokGun = Number(r.stok_gun) || 0;
  });

  const branchDataList = BRANCHES.map((b) => branchMap.get(b.id));
  
  const baseRaw = hesaplaRawPuanlar(branchDataList, toplamMusteriAy, { stokFactor: 1, netKarFactor: 1 });
  const senaryoARaw = hesaplaRawPuanlar(branchDataList, toplamMusteriAy, { stokFactor: 1.25, netKarFactor: 1 });
  const senaryoBRaw = hesaplaRawPuanlar(branchDataList, toplamMusteriAy, { stokFactor: 1, netKarFactor: 0.8 });

  return {
    subeAdlari: branchDataList.map((b) => b.name),
    base: skorlaraDonustur(baseRaw),
    senaryoA: skorlaraDonustur(senaryoARaw),
    senaryoB: skorlaraDonustur(senaryoBRaw),
  };
}

module.exports = {
  BRANCHES,
  MONTHS,
  rgbaForBranch,
  hesaplaSubeSkorlari
};