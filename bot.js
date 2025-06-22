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
    qrGenerated: false
};

// Initialisation Express pour Render
const app = express();
app.use(express.json());

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
            </style>
        </head>
        <body>
            <h1>🚀 Launch Capital WhatsApp Bot</h1>
            
            <div class="status ${botState.ready ? 'ready' : (botState.qrCode ? 'waiting' : 'error')}">
                <h3>Statut: ${botState.ready ? '✅ Bot Connecté et Prêt' : (botState.qrCode ? '⏳ En attente de scan QR Code' : '🔄 Initialisation...')}</h3>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                <p><strong>QR Code disponible:</strong> ${botState.qrCode ? 'Oui' : 'Non'}</p>
                <p><strong>Conversations actives:</strong> ${botState.conversations.size}</p>
                <p><strong>Utilisateurs enregistrés:</strong> ${botState.users.size}</p>
            </div>
            
            ${botState.qrCode ? '<a href="/qr" class="button">📱 Voir le QR Code</a>' : ''}
            ${botState.ready ? '' : '<p><em>La page se rafraîchit automatiquement toutes les 10 secondes...</em></p>'}
        </body>
        </html>
    `);
});

// Endpoint pour obtenir le QR Code - Version améliorée
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
                    .instructions {
                        background: rgba(255,255,255,0.2);
                        padding: 20px;
                        border-radius: 10px;
                        margin: 20px 0;
                    }
                    .button {
                        display: inline-block;
                        padding: 12px 24px;
                        background: rgba(255,255,255,0.2);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        margin: 10px;
                        transition: all 0.3s;
                    }
                    .button:hover {
                        background: rgba(255,255,255,0.3);
                        transform: translateY(-2px);
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
                    
                    <div class="instructions">
                        <h3>📋 Instructions:</h3>
                        <p>1. Ouvrez WhatsApp sur votre téléphone</p>
                        <p>2. Allez dans Menu > WhatsApp Web</p>
                        <p>3. Scannez ce QR Code</p>
                        <p>4. Le bot sera automatiquement connecté</p>
                    </div>
                    
                    <p><small>⏰ QR Code généré à ${new Date().toLocaleString('fr-FR')}</small></p>
                    <p><small>🔄 Cette page se rafraîchit automatiquement</small></p>
                    
                    <a href="/" class="button">📊 Voir le statut</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Erreur génération QR Code:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Erreur QR Code</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2>❌ Erreur de génération du QR Code</h2>
                <p>Une erreur s'est produite lors de la génération du QR Code.</p>
                <p><strong>Erreur:</strong> ${error.message}</p>
                <a href="/">← Retour</a>
            </body>
            </html>
        `);
    }
});

// Endpoint de debugging pour QR Code
app.get('/debug-qr', (req, res) => {
    res.json({
        qrAvailable: !!botState.qrCode,
        qrLength: botState.qrCode ? botState.qrCode.length : 0,
        botReady: botState.ready,
        qrGenerated: botState.qrGenerated,
        timestamp: new Date().toISOString()
    });
});

// Gestion des données (stockage temporaire)
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

// Messages prédéfinis (identique à votre version)
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

    services: `📋 *Nos Services - ${CONFIG.COMPANY_NAME}*

• 💼 *Conseil en investissement*
• 🏦 *Gestion de portefeuille*
• 📈 *Analyses de marché*
• 💰 *Solutions de financement*
• 🎯 *Stratégies d'investissement personnalisées*`,

    technical: `🔧 *Support Technique*

Je vais vous aider à résoudre votre problème technique.

*Types de problèmes courants :*

• 🔐 Problème de connexion à votre compte
• 📱 Difficultés avec l'application mobile
• 💻 Problèmes sur le site web
• 🔄 Synchronisation des données
• 📧 Problèmes d'emails

*Décrivez votre problème technique et je vous guiderai vers la solution.*`,

    account: `👤 *Création de Compte*

Parfait ! Créer un compte chez ${CONFIG.COMPANY_NAME} est simple et rapide.

*Étapes pour créer votre compte :*

1️⃣ Visitez notre site : www.launchcapital.com
2️⃣ Cliquez sur "Créer un compte"
3️⃣ Remplissez vos informations
4️⃣ Vérifiez votre email
5️⃣ Votre compte est activé !

*Besoin d'aide pour une étape particulière ?*

Ou préférez-vous qu'un conseiller vous accompagne ? Tapez "conseiller"`,

    payment: `💳 *Statut de Paiement*

Je vais vous aider à vérifier votre statut de paiement.

*Pour traiter votre demande, j'ai besoin de :*

• 📧 Votre email de compte
• 🔢 Numéro de transaction (si disponible)
• 📅 Date approximative du paiement

*Veuillez fournir ces informations et je vérifierai votre statut.*

⚠️ *Important :* Ne partagez jamais vos mots de passe ou informations bancières complètes.`,

    general: `🤝 *Support Général*

Je suis là pour vous aider avec toutes vos questions concernant ${CONFIG.COMPANY_NAME}.

*Sujets d'aide populaires :*

• 📚 Guide d'utilisation de nos services
• 📞 Horaires et contacts
• 📋 Conditions générales
• 🔒 Sécurité et confidentialité
• 💡 Conseils et astuces

*Posez-moi votre question et je vous donnerai une réponse précise.*`,

    advisor: `👨‍💼 *Conseiller Humain*

Très bien ! Je vais vous mettre en relation avec un de nos conseillers.

*Vos coordonnées et votre demande ont été transmises.*

*Un conseiller vous contactera dans les plus brefs délais.*

*Y a-t-il autre chose que je puisse faire pour vous en attendant ?*`
};

// Fonctions utilitaires (identiques)
function identifyUserNeed(message) {
    const text = message.toLowerCase();
    
    if (text === '1') return 'services';
    if (text === '2') return 'technical';
    if (text === '3') return 'account';
    if (text === '4') return 'payment';
    if (text === '5') return 'general';
    if (text === '6') return 'advisor';
    
    if (text.includes('service') || text.includes('offre') || text.includes('produit')) return 'services';
    if (text.includes('technique') || text.includes('bug') || text.includes('erreur') || text.includes('problème')) return 'technical';
    if (text.includes('compte') || text.includes('inscription') || text.includes('créer')) return 'account';
    if (text.includes('paiement') || text.includes('transaction') || text.includes('facture')) return 'payment';
    if (text.includes('conseiller') || text.includes('humain') || text.includes('personne')) return 'advisor';
    
    return 'general';
}

function saveConversation(phone, message, response, needType) {
    const conversationId = phone.replace('@c.us', '');
    
    if (!botState.conversations.has(conversationId)) {
        botState.conversations.set(conversationId, {
            id: conversationId,
            phone: phone,
            startTime: new Date().toISOString(),
            messages: [],
            needType: needType,
            status: 'active'
        });
    }
    
    const conversation = botState.conversations.get(conversationId);
    conversation.messages.push({
        timestamp: new Date().toISOString(),
        userMessage: message,
        botResponse: response,
        needType: needType
    });
    
    conversation.lastActivity = new Date().toISOString();
    botState.conversations.set(conversationId, conversation);
}

function handleUser(phone, name) {
    const userId = phone.replace('@c.us', '');
    
    if (!botState.users.has(userId)) {
        botState.users.set(userId, {
            id: userId,
            phone: phone,
            name: name,
            firstContact: new Date().toISOString(),
            conversationCount: 0,
            lastActive: new Date().toISOString()
        });
    }
    
    const user = botState.users.get(userId);
    user.conversationCount += 1;
    user.lastActive = new Date().toISOString();
    user.name = name;
    botState.users.set(userId, user);
    
    return user;
}

async function notifyAdmin(phone, name, message, needType) {
    try {
        const adminMessage = `🔔 *Nouvelle Conversation - ${CONFIG.COMPANY_NAME}*

👤 *Client :* ${name}
📱 *Téléphone :* ${phone.replace('@c.us', '')}
🎯 *Besoin :* ${needType}
💬 *Message :* ${message}
⏰ *Heure :* ${new Date().toLocaleString('fr-FR')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        await botState.client.sendMessage(CONFIG.ADMIN_NUMBER, adminMessage);
    } catch (error) {
        console.error('❌ Erreur notification admin:', error);
    }
}

// Commandes admin
const adminCommands = {
    async stats(msg) {
        const totalUsers = botState.users.size;
        const totalConversations = botState.conversations.size;
        const activeToday = Array.from(botState.conversations.values())
            .filter(conv => {
                const today = new Date().toDateString();
                return new Date(conv.lastActivity).toDateString() === today;
            }).length;

        const statsMessage = `📊 *Statistiques ${CONFIG.COMPANY_NAME} Bot*

👥 *Utilisateurs totaux :* ${totalUsers}
💬 *Conversations totales :* ${totalConversations}
📈 *Conversations aujourd'hui :* ${activeToday}
🕐 *Temps de fonctionnement :* ${Math.floor(process.uptime() / 60)} minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        await msg.reply(statsMessage);
    },

    async conversations(msg) {
        const recentConversations = Array.from(botState.conversations.values())
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
            .slice(0, 10);

        let conversationsMessage = `💬 *Dernières Conversations*\n\n`;
        
        recentConversations.forEach((conv, index) => {
            const user = botState.users.get(conv.id);
            conversationsMessage += `${index + 1}. *${user?.name || 'Utilisateur'}*\n`;
            conversationsMessage += `   📱 ${conv.phone.replace('@c.us', '')}\n`;
            conversationsMessage += `   🎯 ${conv.needType}\n`;
            conversationsMessage += `   📅 ${new Date(conv.lastActivity).toLocaleString('fr-FR')}\n\n`;
        });

        await msg.reply(conversationsMessage);
    },

    async backup(msg) {
        await saveData();
        await msg.reply(`💾 *Sauvegarde effectuée*\n\n✅ Conversations : ${botState.conversations.size}\n✅ Utilisateurs : ${botState.users.size}\n⏰ ${new Date().toLocaleString('fr-FR')}`);
    }
};

// Initialisation du client WhatsApp - Version améliorée
async function initializeBot() {
    console.log('🚀 Initialisation du bot Launch Capital...');
    
    await loadData();
    
    // Configuration Puppeteer optimisée pour différents environnements
    const puppeteerConfig = {
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
            '--disable-images',
            '--disable-javascript',
            '--disable-default-apps'
        ]
    };

    // Ajustements pour différents environnements
    if (process.env.NODE_ENV === 'production') {
        puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome';
    }

    botState.client = new Client({
        authStrategy: new LocalAuth({
            dataPath: '/tmp/whatsapp-session'
        }),
        puppeteer: puppeteerConfig
    });

    // Événements du client avec logs détaillés
    botState.client.on('qr', (qr) => {
        console.log('📱 QR Code généré - Longueur:', qr.length);
        botState.qrCode = qr;
        botState.qrGenerated = true;
        console.log('📱 QR Code stocké dans botState');
    });

    botState.client.on('ready', () => {
        console.log('✅ Bot Launch Capital prêt et connecté !');
        botState.ready = true;
        botState.qrCode = null; // Clear QR code quand connecté
        botState.qrGenerated = false;
    });

    botState.client.on('authenticated', () => {
        console.log('🔐 Authentification réussie');
    });

    botState.client.on('auth_failure', (msg) => {
        console.error('❌ Échec authentification:', msg);
        botState.qrCode = null;
        botState.ready = false;
    });

    botState.client.on('disconnected', (reason) => {
        console.log('⚠️ Déconnecté:', reason);
        botState.ready = false;
        botState.qrCode = null;
    });

    botState.client.on('loading_screen', (percent, message) => {
        console.log('🔄 Chargement WhatsApp:', percent + '%', message);
    });

    // Gestion des messages (identique)
    botState.client.on('message', async (msg) => {
        try {
            const phone = msg.from;
            const contact = await msg.getContact();
            const name = contact.pushname || contact.name || 'Client';
            const messageText = msg.body;
            
            if (msg.fromMe) return;
            if (phone === 'status@broadcast') return;
            
            if (phone === CONFIG.ADMIN_NUMBER && messageText.startsWith('/')) {
                const [command] = messageText.slice(1).split(' ');
                if (adminCommands[command]) {
                    await adminCommands[command](msg);
                    return;
                }
            }
            
            const user = handleUser(phone, name);
            const isFirstMessage = user.conversationCount === 1;
            
            let response;
            let needType;
            
            if (isFirstMessage) {
                response = MESSAGES.welcome;
                needType = 'welcome';
            } else {
                needType = identifyUserNeed(messageText);
                response = MESSAGES[needType] || MESSAGES.general;
            }
            
            await msg.reply(response);
            saveConversation(phone, messageText, response, needType);
            
            if (['advisor', 'payment', 'technical'].includes(needType)) {
                await notifyAdmin(phone, name, messageText, needType);
            }
            
            if (Math.random() < 0.1) {
                await saveData();
            }
            
        } catch (error) {
            console.error('❌ Erreur traitement message:', error);
            try {
                await msg.reply(`Désolé, une erreur s'est produite. Un conseiller ${CONFIG.COMPANY_NAME} vous contactera bientôt.`);
            } catch (replyError) {
                console.error('❌ Erreur envoi message d\'erreur:', replyError);
            }
        }
    });

    console.log('🔄 Initialisation du client WhatsApp...');
    await botState.client.initialize();
}

// Sauvegarde périodique et gestion de l'arrêt (identique)
setInterval(async () => {
    if (botState.ready) {
        await saveData();
    }
}, 5 * 60 * 1000);

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
    console.log(`📱 QR Code sera disponible sur : http://localhost:${CONFIG.PORT}/qr`);
    console.log(`📊 Statut disponible sur : http://localhost:${CONFIG.PORT}/`);
    
    initializeBot().catch(error => {
        console.error('❌ Erreur initialisation bot:', error);
    });
});

// Endpoint de santé pour Render
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        botReady: botState.ready,
        qrAvailable: !!botState.qrCode,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
