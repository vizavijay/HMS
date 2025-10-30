
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const getBaseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .email-wrapper {
            width: 100%;
            padding: 20px 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        .header h2 {
            margin: 0;
            font-size: 24px;
        }
        .header h3 {
            margin: 10px 0 0 0;
            font-size: 16px;
            font-weight: normal;
        }
        .content {
            background-color: #ffffff;
            padding: 30px;
        }
        .content p {
            margin: 15px 0;
        }
        .otp-box {
            background-color: #f0f8ff;
            border: 2px solid #059669;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #059669;
        }
        .info-box {
            background-color: #f0fdfa;
            border-left: 4px solid #059669;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .info-box ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .info-box li {
            margin: 8px 0;
        }
        .important-box {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .important-box ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .important-box li {
            margin: 8px 0;
        }
        .footer {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            padding: 30px 20px;
            text-align: center;
            color: #ffffff;
            font-size: 13px;
        }
        .footer p {
            margin: 8px 0;
            line-height: 1.5;
        }
        .footer a {
            color: #ffffff;
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="container">
            <div class="header">
                <h2>SclinEDC</h2>
                <h3>Hypertension Management Study</h3>
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                <p><strong>© 2025 SclinEDC. All rights reserved.</strong></p>
                <p>This is an automated email. Please do not reply.</p>
                <p>For support, contact us at <a href="mailto:support@sclinedc.co.in">support@sclinedc.co.in</a></p>
            </div>
        </div>
    </div>
</body>
</html>
`;

const sendOTPEmail = async (email, fullName, otpCode) => {
    try {
        const content = `
            <p>Dear <strong>${fullName}</strong>,</p>
            
            <p>Your One-Time Password (OTP) for verifying your account is:</p>
            
            <div class="otp-box">
                ${otpCode}
            </div>
            
            <p>This code is valid for <strong>10 minutes</strong>. Please do not share this OTP with anyone for security reasons.</p>
            
            <p>If you did not request this code, please ignore this email or contact our support team immediately.</p>
            
            <p>Thank you,<br>
            <strong>Best Regards,</strong><br>
            The SclinEDC Team</p>
        `;

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'support@sclinedc.co.in',
            to: email,
            subject: 'Your One-Time Password (OTP) - SclinEDC',
            html: getBaseTemplate(content)
        };

        //await transporter.sendMail(mailOptions);
           await resend.emails.send({
  from: mailOptions.from,
  to: mailOptions.to,
  subject: mailOptions.subject,
  html: mailOptions.html
});
        console.log(` OTP email sent to ${email}`);
        return { success: true };

    } catch (error) {
        console.error(' Error sending OTP email:', error);
        throw error;
    }
};

const sendWelcomeEmail = async (email, fullName, roleName, siteName) => {
    try {
        const content = `
            <p>Dear <strong>${fullName}</strong>,</p>
            
            <p>Your account has been successfully created on the <strong>SclinEDC Live</strong>. Below are your account details:</p>
            
           <div class="info-box">
                <ul>
                    <li><strong>Full Name:</strong> ${fullName}</li>
                    <li><strong>Email Address:</strong> ${email}</li>
                    <li><strong>Assigned Role:</strong> ${roleName || 'Not Assigned'}</li>
                    <li><strong>Assigned Site:</strong> ${siteName || 'Not Assigned'}</li>
                </ul>
            </div>
            
            <p>You can access the portal using your registered email address along with the system-generated OTP, which will be sent separately during login.</p>
            
            <div class="info-box">
                <ul>
                    <li><strong>URL:</strong>https://glenmark.nis-2025-27.sclinedc.co.in/</li>           
                </ul>
            </div>
            <div class="important-box">
                <p><strong>Important:</strong></p>
                <ul>
                    <li>Your account is active and ready for use.</li>
                    <li>Please do not share your OTP or login credentials with anyone.</li>
                    <li>If you face any issues logging in, contact our support team at <strong>support@sclinedc.co.in</strong></li>
                </ul>
            </div>
            
            <p>Welcome aboard, and thank you for being part of our platform.</p>
            
            <p><strong>Best Regards,</strong><br>
            The SclinEDC Team</p>
        `;

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'support@sclinedc.co.in',
            to: email,
            subject: 'Your Account Has Been Created on SclinEDC Live',
            html: getBaseTemplate(content)
        };

        //await transporter.sendMail(mailOptions);
           await resend.emails.send({
  from: mailOptions.from,
  to: mailOptions.to,
  subject: mailOptions.subject,
  html: mailOptions.html
});
        console.log(` Welcome email sent to ${email}`);
        return { success: true };

    } catch (error) {
        console.error(' Error sending welcome email:', error);
        throw error;
    }
};

const sendSurveySubmissionEmail = async (email, fullName, studyId, studyTitle) => {
    try {
        const submittedDate = new Date().toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const content = `
            <p>Dear <strong>${fullName}</strong>,</p>
            
            <p>Thank you for submitting your study, <strong>${studyTitle}</strong>, through the SclinEDC Portal.</p>
            
            <p>Your submission has been received successfully.</p>
            
            <div class="info-box">
                <p><strong>Submission Details:</strong></p>
                <ul>
                    <li><strong>Study ID:</strong> ${studyId}</li>
                    <li><strong>Study Title:</strong> ${studyTitle}</li>
                    <li><strong>Submission Date:</strong> ${submittedDate}</li>
                </ul>
            </div>
            
            <p>For any queries, please contact <strong>support@sclinedc.co.in</strong>.</p>
            
            <p><strong>Best Regards,</strong><br>
            The SclinEDC Team</p>
        `;

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'support@sclinedc.co.in',
            to: email,
            subject: `Study Submission Confirmation – ${studyTitle}`,
            html: getBaseTemplate(content)
        };

        //const result = await transporter.sendMail(mailOptions);
        const result =    await resend.emails.send({
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            html: mailOptions.html
        });
      
        console.log(` Study submission email sent to ${email}`, result);
        return { success: true, messageId: result.messageId };

    } catch (error) {
        console.error(' Error sending study submission email:', error);
        console.error('Error details:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    sendSurveySubmissionEmail

};
