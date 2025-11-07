const getIpAddress = (req) => {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // If there are multiple IPs (comma separated), take the first one
  if (ip.includes(',')) ip = ip.split(',')[0].trim();

  // Remove IPv6 prefix if present (like ::ffff:)
  if (ip.startsWith('::ffff:')) ip = ip.replace('::ffff:', '');

  // Sometimes ::1 (localhost IPv6), replace with 127.0.0.1
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getOTPExpiryTime = () => {
  const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
  const expiryTime = new Date();
  expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
  return expiryTime;
};

const setFormattedDate = () => {
  let date = new Date();
  // return date like '24-01-2025 16:37:04'
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0'); //January is 0!
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}:${ss}`;
};

module.exports = {
  setFormattedDate,
  getIpAddress,
  generateOTP,
  getOTPExpiryTime,
};
