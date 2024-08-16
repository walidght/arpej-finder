const axios = require('axios');
const { format } = require('date-fns');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const { sendEmail } = require('./email_service');
const { saveToDb, getFromDb } = require('./db_service');
const fs = require('fs');

function loadUrlIdMapping(filePath = 'url_id_mapping.txt') {
    const absolutePath = path.join(__dirname, filePath);
    const urlIdMap = {};

    try {
        const fileData = fs.readFileSync(absolutePath, 'utf-8');
        fileData.split('\n').forEach((line) => {
            const [key, value] = line.trim().split(':');
            urlIdMap[key] = value;
        });
    } catch (error) {
        console.error(`Failed to read file: ${absolutePath}`, error);
        throw new Error('File not found');
    }

    return urlIdMap;
}

function getUrlResidenceName(url) {
    const normalizedUrl = url.endsWith('/') ? url : `${url}/`;
    const parts = normalizedUrl.split('/');
    return parts.length > 2 ? parts[parts.length - 2] : '';
}

async function getAvailable() {
    const url = 'https://www.arpej.fr/wp-json/sn/residences';
    const params = {
        'related_city[]': 52524,
        price_from: 0,
        price_to: 600,
        public: 'etudiants',
        show_if_full: false,
        show_if_colocations: false,
    };

    try {
        const response = await axios.get(url, { params });
        if (response.status === 200) {
            const data = response.data;
            return data.residences.map((residence) => {
                const key = getUrlResidenceName(residence.link);
                const { link, title: name } = residence;
                const address = `${residence.extra_data.address} ${residence.extra_data.city} ${residence.extra_data.zip_code}`;
                return { key, name, address, link };
            });
        } else {
            console.error(
                `Failed to retrieve data. Status code: ${response.status}`
            );
        }
    } catch (error) {
        console.error(`Error while fetching data: ${error.message}`);
    }
}

function getIds(available) {
    const urlIdMapping = loadUrlIdMapping();
    return available.map((residence) => urlIdMapping[residence.key] || '');
}

async function getToken() {
    const url = 'https://admin.arpej.fr/api/oauth/token';
    const payload = {
        client_id:
            '5d54af239945619afffa307db180badc712e9d315d3937296facc6fe01cefd4d',
        client_secret:
            '82b421e591bb4c158b41063cfd30a1133a7380d7a63a43ab15d084641449ddb4',
        grant_type: 'client_credentials',
    };

    const headers = {
        accept: 'application/json;version=1',
        'content-type': 'application/json;charset=UTF-8',
    };

    try {
        const response = await axios.post(url, payload, { headers });
        if (response.status === 200) {
            return response.data;
        } else {
            console.error(
                `Failed to get token. Status code: ${response.status}`
            );
        }
    } catch (error) {
        console.error(`Error while getting token: ${error.message}`);
    }
}

function getCustomerHeaders(token) {
    const { access_token, token_type } = token;
    return {
        accept: 'application/json;version=1',
        authorization: `${token_type} ${access_token}`,
        'x-locale': 'fr',
        Referer: 'https://ibail.arpej.fr/',
    };
}

async function getAvailabilityMonths(id, token) {
    const url = `https://admin.arpej.fr/api/customer/residences/${id}`;
    const headers = getCustomerHeaders(token);

    try {
        const response = await axios.get(url, { headers });
        if (response.status === 200) {
            return response.data.availability_months;
        } else {
            console.error(
                `Failed to get availability months. Status code: ${response.status}`
            );
            console.error('Response:', response.data);
        }
    } catch (error) {
        console.error(
            `Error while getting availability months: ${error.message}`
        );
    }
}

async function getResidenceOffers(id, availabilityMonths, token) {
    const offers = [];

    for (const availabilityMonth of availabilityMonths) {
        const url = `https://admin.arpej.fr/api/customer/residences/${id}/availabilities/${availabilityMonth}/offers`;
        const headers = getCustomerHeaders(token);

        try {
            const response = await axios.get(url, { headers });
            if (response.status === 200) {
                const data = response.data;
                data.forEach((offer) => {
                    if (!offer.booking_restriction.enabled) {
                        const {
                            rent_amount_from: priceFrom,
                            rent_amount_to: priceTo,
                        } = offer.offer_pricing;
                        offers.push({
                            reserved: false,
                            price_from: priceFrom,
                            price_to: priceTo,
                        });
                    }
                });
            } else {
                console.error(
                    `Failed to get offers for id=${id}, availabilityMonth=${availabilityMonth}`
                );
                console.error(`Status code ${response.status}`);
                console.error('Response:', response.data);
            }
        } catch (error) {
            console.error(
                `Error while getting residence offers: ${error.message}`
            );
        }
    }

    return offers;
}

async function getOffers(ids) {
    const token = await getToken();
    const result = [];

    for (const id of ids) {
        const availabilityMonths = await getAvailabilityMonths(id, token);
        const offers = await getResidenceOffers(id, availabilityMonths, token);
        result.push({ id, offers });
    }

    return result;
}

function cleanOffers(offers, available) {
    return offers.reduce((result, offer, index) => {
        offer.offers.forEach((o) => {
            result.push({
                name: available[index].name,
                address: available[index].address,
                link: available[index].link,
                price_from: o.price_from,
                price_to: o.price_to,
                id: offer.id,
            });
        });
        return result;
    }, []);
}

function filterOffersPrice(offers, priceMax) {
    return offers.filter(
        (offer) => parseFloat(offer.price_from.replace(',', '.')) <= priceMax
    );
}

async function filterSent(offers) {
    const sentToday = await getFromDb(new Date());
    return offers.filter((offer) => {
        return !sentToday.some(
            (sent) =>
                offer.id === sent.id &&
                offer.price_to === sent.price_to &&
                offer.price_from === sent.price_from
        );
    });
}

async function saveSentToDb(offers) {
    const now = new Date();
    const data = offers.map((offer) => ({
        datetime: now,
        id: offer.id,
        price_to: offer.price_to,
        price_from: offer.price_from,
    }));
    await saveToDb(data);
}

async function main() {
    console.log('getting available');
    const available = await getAvailable();

    console.log('getting available ids');
    const ids = getIds(available);

    console.log('getting offers');
    let offers = await getOffers(ids);

    console.log('cleaning offers');
    offers = cleanOffers(offers, available);

    console.log('filtering offers with price');
    offers = filterOffersPrice(offers, 600);

    console.log('filtering sent offers');
    offers = await filterSent(offers);

    if (offers.length === 0) {
        console.log('no offers to send');
        return;
    }

    console.log('sending email');
    const success = await sendEmail(offers);

    if (success) {
        console.log('email sent successfully');
        console.log('saving sent offers to db');
        await saveSentToDb(offers);
    } else {
        console.log('email not sent');
    }

    console.log('fin');
}

if (require.main === module) {
    main();
}

module.exports = { main };
