const jwt = require('jsonwebtoken');
const clients = require('../config/clients');

function generatePassKitToken(apiKey, apiSecret) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { uid: apiKey, iat: now, exp: now + 60 },
    apiSecret,
    { algorithm: 'HS256' }
  );
}

async function callPassKit(endpoint, method = 'GET', body = null) {
  const apiKey = process.env.PASSKIT_API_KEY;
  const apiSecret = process.env.PASSKIT_API_SECRET;
  const baseUrl = process.env.PASSKIT_API_URL || 'https://api.pub1.passkit.io';

  const token = generatePassKitToken(apiKey, apiSecret);
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${baseUrl}${endpoint}`, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Chyba komunikace s PassKit API');
  }
  return data;
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
