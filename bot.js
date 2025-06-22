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
    users: new Map()
};

// Initialisation Express pour Render
const app = express();
app.use(express.json());

// Page d'accueil simple
app.get('/', (req, res) => {
    res.json({
        status: 'Launch Capital Bot',
        ready: botState.ready,
        timestamp: new Date().toISOString()
    });
});

// Endpoint pour obtenir le QR Code
app.get('/qr', async (req, res) => {
    if (botState.qrCode) {
        try {
            const qrImage = await QRCode.toDataURL(botState.qrCode);
            res.send(`
                <html>
                    <head><title>Launch Capital Bot - QR Code</title></head>
                    <body style="text-align: center; font-family: Arial;">
                        <h2>Launch Capital WhatsApp Bot</h2>
                        <p>Scannez ce QR Code avec WhatsApp pour connecter le bot</p>
                        <img src="${qrImage}" alt="QR Code" style="max-width: 300px;"/>
                        <p><small>Actualisez la page si le QR Code ne se charge pas</small></p>
                    </body>
                </html>
            `);
        } catch (error) {
            res.json({ error: 'Erreur génération QR Code' });
        }
    } else {
        res.json({ message: 'QR Code non disponible. Bot peut-être déjà connecté.' });
    }
});

// Gestion des données (stockage temporaire)
async function loadData() {
    try {
        // Charger les conversations
        const conversationsData = await fs.readFile(CONFIG.CONVERSATIONS_FILE, 'utf8');
        const conversations = JSON.parse(conversationsData);
        botState.conversations = new Map(Object.entries(conversations));
    } catch (error) {
        console.log('Aucune conversation existante trouvée');
        botState.conversations = new Map();
    }

    try {
        // Charger les utilisateurs
        const usersData = await fs.readFile(CONFIG.USERS_FILE, 'utf8');
        const users = JSON.parse(usersData);
        botState.users = new Map(Object.entries(users));
    } catch (error) {
        console.log('Aucun utilisateur existant trouvé');
        botState.users = new Map();
    }
}

async function saveData() {
    try {
        // Sauvegarder les conversations
        const conversationsObj = Object.fromEntries(botState.conversations);
        await fs.writeFile(CONFIG.CONVERSATIONS_FILE, JSON.stringify(conversationsObj, null, 2));

        // Sauvegarder les utilisateurs
        const usersObj = Object.fromEntries(botState.users);
        await fs.writeFile(CONFIG.USERS_FILE, JSON.stringify(usersObj, null, 2));
    } catch (error) {
        console.error('Erreur sauvegarde:', error);
    }
}

// Messages prédéfinis
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
• 🎯 *Stratégies d'investissement personnalisées*

*Souhaitez-vous plus d'informations sur un service particulier ?*

Tapez le nom du service ou contactez notre équipe commerciale au : +237 xxx xxx xxx`,

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

⚠️ *Important :* Ne partagez jamais vos mots de passe ou informations bancaires complètes.`,

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

📞 *Vous pouvez aussi nous contacter directement :*
• Téléphone : +237 xxx xxx xxx
• Email : support@launchcapital.com
• Horaires : Lun-Ven 8h-18h

*Un conseiller vous contactera dans les plus brefs délais.*

*Y a-t-il autre chose que je puisse faire pour vous en attendant ?*`
};

// Fonction pour identifier le type de besoin
function identifyUserNeed(message) {
    const text = message.toLowerCase();
    
    // Réponses aux choix numériques
    if (text === '1') return 'services';
    if (text === '2') return 'technical';
    if (text === '3') return 'account';
    if (text === '4') return 'payment';
    if (text === '5') return 'general';
    if (text === '6') return 'advisor';
    
    // Détection par mots-clés
    if (text.includes('service') || text.includes('offre') || text.includes('produit')) return 'services';
    if (text.includes('technique') || text.includes('bug') || text.includes('erreur') || text.includes('problème')) return 'technical';
    if (text.includes('compte') || text.includes('inscription') || text.includes('créer')) return 'account';
    if (text.includes('paiement') || text.includes('transaction') || text.includes('facture')) return 'payment';
    if (text.includes('conseiller') || text.includes('humain') || text.includes('personne')) return 'advisor';
    
    return 'general';
}

// Fonction pour sauvegarder une conversation
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

// Fonction pour gérer les utilisateurs
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
    user.name = name; // Mise à jour du nom si changé
    botState.users.set(userId, user);
    
    return user;
}

// Fonction pour notifier l'admin
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
        console.error('Erreur notification admin:', error);
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

// Initialisation du client WhatsApp
async function initializeBot() {
    console.log('🚀 Initialisation du bot Launch Capital...');
    
    // Charger les données existantes
    await loadData();
    
    // Créer le client WhatsApp
    botState.client = new Client({
        authStrategy: new LocalAuth({
            dataPath: '/tmp/whatsapp-session'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        }
    });

    // Événements du client
    botState.client.on('qr', (qr) => {
        console.log('📱 QR Code généré');
        botState.qrCode = qr;
    });

    botState.client.on('ready', () => {
        console.log('✅ Bot Launch Capital prêt !');
        botState.ready = true;
        botState.qrCode = null;
    });

    botState.client.on('authenticated', () => {
        console.log('🔐 Authentification réussie');
    });

    botState.client.on('auth_failure', (msg) => {
        console.error('❌ Échec authentification:', msg);
    });

    botState.client.on('disconnected', (reason) => {
        console.log('⚠️ Déconnecté:', reason);
        botState.ready = false;
    });

    // Gestion des messages
    botState.client.on('message', async (msg) => {
        try {
            const phone = msg.from;
            const contact = await msg.getContact();
            const name = contact.pushname || contact.name || 'Client';
            const messageText = msg.body;
            
            // Ignorer les messages du bot lui-même
            if (msg.fromMe) return;
            
            // Ignorer les messages de statut
            if (phone === 'status@broadcast') return;
            
            // Commandes admin
            if (phone === CONFIG.ADMIN_NUMBER && messageText.startsWith('/')) {
                const [command] = messageText.slice(1).split(' ');
                if (adminCommands[command]) {
                    await adminCommands[command](msg);
                    return;
                }
            }
            
            // Gérer l'utilisateur
            const user = handleUser(phone, name);
            
            // Vérifier si c'est le premier message de l'utilisateur
            const isFirstMessage = user.conversationCount === 1;
            
            let response;
            let needType;
            
            if (isFirstMessage) {
                // Premier message : envoyer le message de bienvenue
                response = MESSAGES.welcome;
                needType = 'welcome';
            } else {
                // Messages suivants : identifier le besoin et répondre
                needType = identifyUserNeed(messageText);
                response = MESSAGES[needType] || MESSAGES.general;
            }
            
            // Envoyer la réponse
            await msg.reply(response);
            
            // Sauvegarder la conversation
            saveConversation(phone, messageText, response, needType);
            
            // Notifier l'admin pour les demandes importantes
            if (['advisor', 'payment', 'technical'].includes(needType)) {
                await notifyAdmin(phone, name, messageText, needType);
            }
            
            // Sauvegarder périodiquement
            if (Math.random() < 0.1) { // 10% de chance de sauvegarder
                await saveData();
            }
            
        } catch (error) {
            console.error('Erreur traitement message:', error);
            try {
                await msg.reply(`Désolé, une erreur s'est produite. Un conseiller ${CONFIG.COMPANY_NAME} vous contactera bientôt.`);
            } catch (replyError) {
                console.error('Erreur envoi message d\'erreur:', replyError);
            }
        }
    });

    // Initialiser le client
    await botState.client.initialize();
}

// Sauvegarde périodique
setInterval(async () => {
    if (botState.ready) {
        await saveData();
    }
}, 5 * 60 * 1000); // Toutes les 5 minutes

// Gestion de l'arrêt propre
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
    console.log(`📱 QR Code disponible sur : http://localhost:${CONFIG.PORT}/qr`);
    
    // Initialiser le bot
    initializeBot().catch(error => {
        console.error('❌ Erreur initialisation bot:', error);
    });
});

// Endpoint de santé pour Render
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        botReady: botState.ready,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
