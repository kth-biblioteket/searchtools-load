"use strict";

require('dotenv').config();
const fs = require('fs');
const cron = require('node-cron');
const axois = require('axios')

async function loadMeili() {
    const bunyan = require('bunyan');

    var log = bunyan.createLogger({
        name: "meiliload",
        streams: [{
            type: 'rotating-file',
            path: 'meiliload.log',
            period: '1d',
            count: 3
        }]
    });

    const ldap = require('ldapjs');
    log.info('Started loadMeili');

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
            console.log(searchRequest.messageID)
        });
        res.on('searchEntry', async (entry) => {
            try {
                console.log(entry.object)
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
                    axois.post(
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
            ugusersjson = []
            return;
        });
    });
}

//cron.schedule(process.env.CRON, () => {
    console.log(process.env)
    loadMeili()
//});