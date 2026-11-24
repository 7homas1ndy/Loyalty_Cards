const https = require('https');
const clients = require('../config/clients');

function callPassKit(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    // .trim() odstraní případné neviditelné mezery a zalomení řádku z Vercelu
    const token = (process.env.PASSKIT_API_TOKEN || '').trim();
    const rawUrl = (process.env.PASSKIT_API_URL || 'https://passkit.io').trim().replace(/\/$/, '');
    const fullUrl = new URL(`${rawUrl}${endpoint}`);

    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: fullUrl.hostname,
      path: fullUrl.pathname + fullUrl.search,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`PassKit (${res.statusCode}): ${parsed.message || data}`));
          }
        } catch (e) {
          reject(new Error(`Chyba odpovědi (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Síťová chyba (${fullUrl.hostname}): ${err.message}`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, pin, action, memberId, amount } = req.body;
  const client = clients[slug];

  if (!client) {
    return res.status(404).json({ error: 'Podnik nenalezen v konfiguraci.' });
  }
  if (client.pin !== String(pin)) {
    return res.status(401).json({ error: 'Neplatný PIN obsluhy.' });
  }

  if (action === 'init') {
    return res.status(200).json({
      name: client.name,
      color: client.color,
      type: client.type,
      unitName: client.unitName,
      rewardThreshold: client.rewardThreshold,
      pointsPerCzk: client.pointsPerCzk
    });
  }

  if (!memberId) {
    return res.status(400).json({ error: 'Chybí ID karty zákazníka.' });
  }

  try {
    if (action === 'lookup') {
      const member = await callPassKit(`/members/member/${encodeURIComponent(memberId)}`, 'GET');
      return res.status(200).json({
        id: member.id,
        name: member.person?.displayName || member.person?.forename || 'Zákazník',
        points: member.points || 0
      });
    }

    if (action === 'earn') {
      const pointsToAdd = client.type === 'stamps'
        ? 1
        : Math.round(Number(amount) * client.pointsPerCzk);

      if (pointsToAdd <= 0) {
        return res.status(400).json({ error: 'Zadejte platnou částku.' });
      }

      const updated = await callPassKit('/members/member/points/earn', 'PUT', {
        id: memberId,
        points: pointsToAdd
      });

      return res.status(200).json({
        points: updated.points,
        added: pointsToAdd
      });
    }

    if (action === 'burn') {
      const updated = await callPassKit('/members/member/points/burn', 'PUT', {
        id: memberId,
        points: client.rewardThreshold
      });

      return res.status(200).json({
        points: updated.points,
        burned: client.rewardThreshold
      });
    }

    return res.status(400).json({ error: 'Neznámá akce.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
