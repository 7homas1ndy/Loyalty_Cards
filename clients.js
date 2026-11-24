module.exports = {
  "gyros-max": {
    name: "Gyros Max Přerov",
    pin: "1234",
    color: "#e65100",
    type: "stamps",          // "stamps" (razítka) nebo "points" (body za útratu)
    unitName: "razítek",     // text na displeji (např. "razítek" nebo "bodů")
    rewardThreshold: 7,      // kolik razítek/bodů je potřeba na odměnu
    pointsPerCzk: 1          // u "stamps" vždy 1; u "points" např. 0.1 (1 bod za 10 Kč)
  },
  "kavarna-centrum": {
    name: "Kavárna Centrum",
    pin: "5678",
    color: "#4e342e",
    type: "points",
    unitName: "bodů",
    rewardThreshold: 100,
    pointsPerCzk: 0.1        // zákazník utratí 150 Kč -> získá 15 bodů
  }
};
