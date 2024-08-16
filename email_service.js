const nodemailer = require('nodemailer');
const { format } = require('date-fns');

// Load environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;

function generateEmailBody(data) {
    let html = `
    <html>
    <head>
        <style>
            table {
                border-collapse: collapse;
                width: 100%;
            }
            th, td {
                border: 1px solid #dddddd;
                text-align: left;
                padding: 8px;
            }
            th {
                background-color: #f2f2f2;
            }
        </style>
    </head>
    <body>
        <h2>Residences Information</h2>
        <table>
            <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Price (From)</th>
                <th>Price (To)</th>
                <th>Link</th>
            </tr>`;

    if (data.length === 0) {
        return null;
    }

    data.forEach((residence) => {
        html += `
        <tr>
            <td>${residence.name}</td>
            <td>${residence.address}</td>
            <td>${residence.price_from} €/mois</td>
            <td>${residence.price_to} €/mois</td>
            <td><a href="${residence.link}" target="_blank">Visit Residence</a></td>
        </tr>`;
    });

    html += `
        </table>
    </body>
    </html>`;

    return html;
}

function setupServer(address, password) {
    // Set up the transporter using SMTP
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: false, // TLS requires secureConnection to be false
        auth: {
            user: address,
            pass: password,
        },
    });
}

function setupMime(data, fromAddress, toAddress) {
    const htmlBody = generateEmailBody(data);

    if (!htmlBody) {
        return null;
    }

    // Get today's date and format it as DD/MM
    const formattedDate = format(new Date(), 'dd/MM');

    const subject = `ARPEJ's Available Residences - ${formattedDate}`;

    // Setup the email options
    const mailOptions = {
        from: `"ARPEJ FINDER" <${fromAddress}>`,
        to: toAddress,
        subject: subject,
        html: htmlBody,
    };

    return mailOptions;
}

async function sendEmail(data) {
    const outlookAddress = EMAIL;
    const outlookPassword = PASSWORD;

    if (!outlookAddress || !outlookPassword) {
        console.log('Please set the EMAIL and PASSWORD in the .env file.');
        return;
    }

    const toAddress = NOTIFICATION_EMAIL;

    const mailOptions = setupMime(data, outlookAddress, toAddress);

    if (!mailOptions) {
        console.log('No residences available. Email not sent.');
        return;
    }

    try {
        const transporter = setupServer(outlookAddress, outlookPassword);

        // Send the email
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully.');
        return true;
    } catch (error) {
        console.log(`Failed to send email. Error: ${error}`);
    }
}

module.exports = {
    sendEmail,
};
