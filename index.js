"use strict";

require('dotenv').config();
const fs = require('fs');
const cron = require('node-cron');
const axios = require('axios')
const bunyan = require('bunyan');

const log = bunyan.createLogger({
    name: "meiliload",
    streams: [{
        type: 'rotating-file',
        path: 'meiliload.log',
        period: '1d',
        count: 3
    }]
});

async function loadUG() {
    const ldap = require('ldapjs');
    log.info('Started loadMeili UG');

    const client = ldap.createClient({
        url: 'ldaps://ug.kth.se',
        baseDN: 'dc=ug,dc=kth,dc=se',
        username: process.env.LDAP_USER,
        password: process.env.LDAP_PWD,
        tlsOptions: {
            rejectUnauthorized: false
        }
    });

    client.bind(process.env.LDAP_USER, process.env.LDAP_PWD, (err) => {
        if (err) {
            log.info(err);
        }
    });

    client.on('error', (err) => {
        log.info(err);
    })

    const opts = {
        filter: '(&(objectCategory=User)(sAMAccountName=' + process.env.FILTER + '))',
        scope: 'sub',
        paged: { pageSize: 1000, pagePause: false },
        attributes: ['sAMAccountName', 'sn', 'givenName', 'displayName', 'ugKthid',
            'ugUsername', 'mail', 'title', 'whenCreated', 'whenChanged', 'ugAffiliation',
            'ugPrimaryAffiliation', 'kthPAGroupMembership']
    };

    if (process.env.DELETE == 'true') {
    }
    let count = 0;
    let ugusersjson = [];
    let regexpattern = new RegExp('^[A-Za-z0-9]+$');

    client.search('dc=ug,dc=kth,dc=se', opts, async (err, res) => {
        res.on('searchRequest', (searchRequest) => {
            if (process.env.LOG_LEVEL=='debug') {
                console.log(searchRequest.messageID)
            }
        });
        res.on('searchEntry', async (entry) => {
            try {
                if (entry.object.sAMAccountName) {
                    count++
                    if (regexpattern.test(entry.object.sAMAccountName) === false) {
                    } else {
                        ugusersjson.push(entry.object)
                    }
                } 
            } catch (e) {
                console.log(e)
            }
        });
        res.on('searchReference', (referral) => {
        });
        res.on('error', (err) => {
            log.info(err);
        });
        res.on('end', async (result) => {
            log.info("Total count: " + count)
            for (let i = 0; i < ugusersjson.length; i += parseInt(process.env.BULKSIZE)) {
                let data = JSON.stringify(ugusersjson.slice(i, i + parseInt(process.env.BULKSIZE)))
                try {
                    axios.post(
                        `${process.env.MEILI_HOST}/indexes/ugusers/documents`,
                            data,
                            {
                                headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.MEILI_KEY}`,
                                },
                                maxContentLength: Infinity,
                                maxBodyLength: Infinity,
                            }
                    ) 
                } catch(e) {
                    console.log(e)
                }
            }
            log.info('Number of users added: ' + ugusersjson.length)
            log.info('Finished loadMeili')
            ugusersjson = [];
            client.unbind((err) => {
                if (err) {
                    log.error('Error unbinding LDAP client:', err);
                } else {
                    log.info('LDAP client unbound successfully.');
                }
            });
            return;
        });
    });
}

async function loadKTHAnst() {
    log.info('Started loadMeili KthAnst');

    if (process.env.DELETE == 'true') {
    }
    try {
        const perPage = process.env.KTH_ANST_API_PER_PAGE;
        let page = 1;
        let kthanst = [];

        while (true) {
            try {
                const response = await axios.get(`${process.env.KTH_ANST_API}?page=${page}&per_page=${perPage}&apikey=${process.env.KTH_ANST_API_KEY}`);
                const records = response.data.data;

                if (records.length === 0) {
                    break;
                }

                kthanst = kthanst.concat(records);
                page++;

            } catch (error) {
                console.log('Error fetching records:', error);
                break;
            }
        }

        kthanst = addid(kthanst)
        for (let i = 0; i < kthanst.length; i += parseInt(process.env.BULKSIZE)) {
            let data = JSON.stringify(kthanst.slice(i, i + parseInt(process.env.BULKSIZE)))
            
            axios.post(
                `${process.env.MEILI_HOST}/indexes/kthanst/documents`,
                    data,
                    {
                        headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.MEILI_KEY}`,
                        },
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                    }
            ) 

        }
        log.info('Number of KthAnst added: ' + kthanst.length)
        log.info('Finished loadMeili KthAnst')
    } catch(e) {
        console.log(e)
    }
    
}

function addid(data){
    return data.map((item, index) => {
        return {
            id: index +1,
            ...item
        }
    });

}

cron.schedule(process.env.CRON, () => {
    console.log(new Date().toLocaleString());
    console.log("Cron job started");
    loadUG()
    loadKTHAnst()
});

console.log(new Date().toLocaleString());
console.log("Searchtools-load started");