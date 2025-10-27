



const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const getOTPExpiryTime = () => {
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + expiryMinutes);
    return expiryTime;
};

module.exports = {
    generateOTP,
    getOTPExpiryTime
};