const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    PORT: process.env.PORT || 3000,
    COMPANY_NAME: 'Launch Capital',
    ADMIN_NUMBER: process.env.ADMIN_NUMBER || '237651104356@c.us',
    CONVERSATIONS_FILE: '/tmp/conversations.json',
    USERS_FILE: '/tmp/users.json'
};

// État global du bot
const botState = {
    client: null,
    ready: false,
    qrCode: null,
    conversations: new Map(),
    users: new Map(),
    qrGenerated: false,
    initializationError: null
};

// Initialisation Express
const app = express();
app.use(express.json());

// Configuration Puppeteer pour différents environnements
function getPuppeteerConfig() {
    const baseConfig = {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-default-apps',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--enable-features=NetworkService,NetworkServiceLogging',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--no-default-browser-check',
            '--no-experiments',
            '--use-mock-keychain',
            '--disable-blink-features=AutomationControlled'
        ]
    };

    // Détection de l'environnement et configuration appropriée
    if (process.env.RENDER || process.env.NODE_ENV === 'production') {
        console.log('🔧 Configuration Puppeteer pour production (Render)');
        
        // Tentative de détecter Chrome/Chromium
        const possiblePaths = [
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/snap/bin/chromium',
            process.env.PUPPETEER_EXECUTABLE_PATH
        ].filter(Boolean);

        for (const chromePath of possiblePaths) {
            try {
                require('fs').accessSync(chromePath, require('fs').constants.F_OK);
                console.log(`✅ Chrome trouvé à : ${chromePath}`);
                baseConfig.executablePath = chromePath;
                break;
            } catch (error) {
                console.log(`❌ Chrome non trouvé à : ${chromePath}`);
            }
        }

        if (!baseConfig.executablePath) {
            console.log('⚠️ Aucun exécutable Chrome trouvé, utilisation du Chromium bundled');
        }

        // Arguments supplémentaires pour les environnements containerisés
        baseConfig.args.push(
            '--memory-pressure-off',
            '--max_old_space_size=4096',
            '--disable-background-mode',
            '--disable-extensions',
            '--disable-plugins',
            '--run-all-compositor-stages-before-draw',
            '--disable-bundled-ppapi-flash',
            '--mute-audio',
            '--no-pings',
            '--no-default-browser-check',
            '--autoplay-policy=user-gesture-required',
            '--disable-background-timer-throttling',
            '--disable-permissions-api',
            '--disable-prompt-on-repost',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-client-side-phishing-detection',
            '--disable-popup-blocking',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list'
        );
    } else {
        console.log('🔧 Configuration Puppeteer pour développement local');
    }

    return baseConfig;
}

// Page d'accueil avec statut détaillé
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Launch Capital Bot Status</title>
            <meta http-equiv="refresh" content="10">
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .status { padding: 20px; border-radius: 10px; margin: 20px 0; }
                .ready { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .waiting { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                .error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
                .error-details { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; white-space: pre-wrap; }
            </style>
        </head>
        <body>
            <h1>🚀 Launch Capital WhatsApp Bot</h1>
            
            <div class="status ${botState.ready ? 'ready' : (botState.qrCode ? 'waiting' : (botState.initializationError ? 'error' : 'waiting'))}">
                <h3>Statut: ${
                    botState.ready ? '✅ Bot Connecté et Prêt' : 
                    botState.qrCode ? '⏳ En attente de scan QR Code' : 
                    botState.initializationError ? '❌ Erreur d\'initialisation' :
                    '🔄 Initialisation en cours...'
                }</h3>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p><strong>QR Code disponible:</strong> ${botState.qrCode ? 'Oui' : 'Non'}</p>
                <p><strong>Conversations actives:</strong> ${botState.conversations.size}</p>
                <p><strong>Utilisateurs enregistrés:</strong> ${botState.users.size}</p>
                <p><strong>Uptime:</strong> ${Math.floor(process.uptime() / 60)} minutes</p>
                
                ${botState.initializationError ? `
                    <div class="error-details">
                        <strong>Erreur d'initialisation:</strong><br>
                        ${botState.initializationError}
                    </div>
                ` : ''}
            </div>
            
            ${botState.qrCode ? '<a href="/qr" class="button">📱 Voir le QR Code</a>' : ''}
            <a href="/debug" class="button">🔍 Debug Info</a>
            ${botState.ready ? '' : '<p><em>La page se rafraîchit automatiquement toutes les 10 secondes...</em></p>'}
        </body>
        </html>
    `);
});

// Page de debug pour diagnostiquer les problèmes
app.get('/debug', (req, res) => {
    const debugInfo = {
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            RENDER: !!process.env.RENDER,
            PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
            platform: process.platform,
            arch: process.arch
        },
        bot: {
            ready: botState.ready,
            qrAvailable: !!botState.qrCode,
            qrGenerated: botState.qrGenerated,
            initializationError: botState.initializationError
        },
        memory: process.memoryUsage(),
        uptime: process.uptime()
    };

    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Debug Info</title></head>
        <body style="font-family: Arial; padding: 20px;">
            <h2>🔍 Debug Information</h2>
            <pre style="background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto;">
${JSON.stringify(debugInfo, null, 2)}
            </pre>
            <a href="/">← Retour</a>
        </body>
        </html>
    `);
});

// Endpoint QR Code amélioré
app.get('/qr', async (req, res) => {
    console.log('📱 Demande QR Code reçue');
    
    if (!botState.qrCode) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Launch Capital Bot - QR Code</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .waiting { background: #fff3cd; padding: 20px; border-radius: 10px; margin: 20px; }
                </style>
            </head>
            <body>
                <h2>🔄 Launch Capital WhatsApp Bot</h2>
                <div class="waiting">
                    <h3>QR Code en cours de génération...</h3>
                    <p>Le bot est en cours d'initialisation.</p>
                    <p><strong>Statut:</strong> ${botState.ready ? 'Déjà connecté' : 'Initialisation...'}</p>
                    ${botState.initializationError ? `<p><strong>Erreur:</strong> ${botState.initializationError}</p>` : ''}
                    <p><em>Cette page se rafraîchit automatiquement toutes les 5 secondes.</em></p>
                </div>
                <a href="/">← Retour au statut</a>
            </body>
            </html>
        `);
        return;
    }

    try {
        console.log('📱 Génération de l\'image QR Code...');
        const qrImage = await QRCode.toDataURL(botState.qrCode, {
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Launch Capital Bot - QR Code</title>
                <meta http-equiv="refresh" content="30">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 20px;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        min-height: 100vh;
                        margin: 0;
                    }
                    .container { 
                        background: rgba(255,255,255,0.1); 
                        padding: 30px; 
                        border-radius: 20px;
                        backdrop-filter: blur(10px);
                        max-width: 500px;
                        margin: 50px auto;
                    }
                    .qr-container {
                        background: white;
                        padding: 20px;
                        border-radius: 15px;
                        display: inline-block;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>📱 Launch Capital WhatsApp Bot</h2>
                    <p><strong>Scannez ce QR Code avec WhatsApp</strong></p>
                    
                    <div class="qr-container">
                        <img src="${qrImage}" alt="QR Code WhatsApp" style="max-width: 350px; width: 100%;"/>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <h3>📋 Instructions:</h3>
                        <p>1. Ouvrez WhatsApp sur votre téléphone</p>
                        <p>2. Allez dans Menu > WhatsApp Web</p>
                        <p>3. Scannez ce QR Code</p>
                        <p>4. Le bot sera automatiquement connecté</p>
                    </div>
                    
                    <p><small>⏰ QR Code généré à ${new Date().toLocaleString('fr-FR')}</small></p>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Erreur génération QR Code:', error);
        res.status(500).send(`<h2>❌ Erreur: ${error.message}</h2><a href="/">← Retour</a>`);
    }
});

// Messages et fonctions utilitaires (identiques à votre version précédente)
const MESSAGES = {
    welcome: `Bonjour et bienvenue chez ${CONFIG.COMPANY_NAME} 👋

Je suis votre assistant virtuel et je suis là pour vous aider.

*Quel est votre besoin ou votre question aujourd'hui ?*

Vous pouvez taper le numéro correspondant à votre besoin :

1️⃣ *Informations sur nos services*
2️⃣ *Problème technique*
3️⃣ *Création de compte*
4️⃣ *Statut de paiement*
5️⃣ *Support général*
6️⃣ *Parler à un conseiller*

Ou décrivez directement votre préoccupation, je vous aiderai avec plaisir ! 😊`,
    // ... autres messages identiques
};

// Fonctions utilitaires (loadData, saveData, etc.) - identiques à votre version

async function loadData() {
    try {
        const conversationsData = await fs.readFile(CONFIG.CONVERSATIONS_FILE, 'utf8');
        const conversations = JSON.parse(conversationsData);
        botState.conversations = new Map(Object.entries(conversations));
        console.log(`📂 ${botState.conversations.size} conversations chargées`);
    } catch (error) {
        console.log('📂 Aucune conversation existante trouvée');
        botState.conversations = new Map();
    }

    try {
        const usersData = await fs.readFile(CONFIG.USERS_FILE, 'utf8');
        const users = JSON.parse(usersData);
        botState.users = new Map(Object.entries(users));
        console.log(`👥 ${botState.users.size} utilisateurs chargés`);
    } catch (error) {
        console.log('👥 Aucun utilisateur existant trouvé');
        botState.users = new Map();
    }
}

async function saveData() {
    try {
        const conversationsObj = Object.fromEntries(botState.conversations);
        await fs.writeFile(CONFIG.CONVERSATIONS_FILE, JSON.stringify(conversationsObj, null, 2));

        const usersObj = Object.fromEntries(botState.users);
        await fs.writeFile(CONFIG.USERS_FILE, JSON.stringify(usersObj, null, 2));
        
        console.log('💾 Données sauvegardées');
    } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
    }
}

// Initialisation du bot avec gestion d'erreur améliorée
async function initializeBot() {
    console.log('🚀 Initialisation du bot Launch Capital...');
    
    try {
        await loadData();
        
        const puppeteerConfig = getPuppeteerConfig();
        console.log('🔧 Configuration Puppeteer:', JSON.stringify(puppeteerConfig, null, 2));
        
        botState.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: '/tmp/whatsapp-session'
            }),
            puppeteer: puppeteerConfig
        });

        // Événements du client
        botState.client.on('qr', (qr) => {
            console.log('📱 QR Code généré - Longueur:', qr.length);
            botState.qrCode = qr;
            botState.qrGenerated = true;
            botState.initializationError = null; // Clear any previous errors
        });

        botState.client.on('ready', () => {
            console.log('✅ Bot Launch Capital prêt et connecté !');
            botState.ready = true;
            botState.qrCode = null;
            botState.qrGenerated = false;
            botState.initializationError = null;
        });

        botState.client.on('authenticated', () => {
            console.log('🔐 Authentification réussie');
        });

        botState.client.on('auth_failure', (msg) => {
            console.error('❌ Échec authentification:', msg);
            botState.initializationError = `Échec authentification: ${msg}`;
            botState.qrCode = null;
            botState.ready = false;
        });

        botState.client.on('disconnected', (reason) => {
            console.log('⚠️ Déconnecté:', reason);
            botState.ready = false;
            botState.qrCode = null;
            botState.initializationError = `Déconnecté: ${reason}`;
        });

        // Gestion des messages (simplifiée pour l'exemple)
        botState.client.on('message', async (msg) => {
            try {
                if (msg.fromMe || msg.from === 'status@broadcast') return;
                
                console.log('📨 Message reçu de:', msg.from);
                await msg.reply(`Merci pour votre message ! Le bot ${CONFIG.COMPANY_NAME} est opérationnel.`);
                
            } catch (error) {
                console.error('❌ Erreur traitement message:', error);
            }
        });

        console.log('🔄 Initialisation du client WhatsApp...');
        await botState.client.initialize();
        
    } catch (error) {
        console.error('❌ Erreur critique lors de l\'initialisation:', error);
        botState.initializationError = `Erreur critique: ${error.message}`;
        
        // Retry après 30 secondes
        setTimeout(() => {
            console.log('🔄 Tentative de redémarrage...');
            initializeBot();
        }, 30000);
    }
}

// Gestion propre de l'arrêt
process.on('SIGINT', async () => {
    console.log('🔄 Arrêt du bot...');
    await saveData();
    if (botState.client) {
        await botState.client.destroy();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Arrêt du bot (SIGTERM)...');
    await saveData();
    if (botState.client) {
        await botState.client.destroy();
    }
    process.exit(0);
});

// Démarrage du serveur
app.listen(CONFIG.PORT, () => {
    console.log(`🌐 Serveur démarré sur le port ${CONFIG.PORT}`);
    console.log(`📊 Statut disponible sur : http://localhost:${CONFIG.PORT}/`);
    console.log(`📱 QR Code sera disponible sur : http://localhost:${CONFIG.PORT}/qr`);
    console.log(`🔍 Debug info disponible sur : http://localhost:${CONFIG.PORT}/debug`);
    
    // Démarrer l'initialisation du bot après un petit délai
    setTimeout(() => {
        initializeBot().catch(error => {
            console.error('❌ Erreur initialisation bot:', error);
            botState.initializationError = error.message;
        });
    }, 2000);
});

// Endpoint de santé
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        botReady: botState.ready,
        qrAvailable: !!botState.qrCode,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        error: botState.initializationError
    });
});
