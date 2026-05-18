// ═════════════════════════════════════════════════════════════════════════════
// SYSTÈME DÉBLOCAGE AUTOMATIQUE PAR NIVEAUX - PorteàPorte
// Fichier: api/livreur-levels-release.js (À copier dans Vercel)
// ═════════════════════════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ═════════════════════════════════════════════════════════════════════════════
// FONCTION: Déterminer le niveau du livreur
// ═════════════════════════════════════════════════════════════════════════════

async function getLivreurLevel(livreurId) {
  try {
    // Récupérer le profil du livreur
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('livraisons, score')
      .eq('id', livreurId)
      .single();

    if (profileError) throw profileError;

    const deliveriesCount = profile.livraisons || 0;
    const rating = profile.score || 0;

    // Récupérer la config
    const { data: config, error: configError } = await supabase
      .from('livreur_levels_config')
      .select('*')
      .single();

    if (configError) {
      console.warn('Config non trouvée, utiliser défaut');
      return getDefaultLevel(deliveriesCount, rating);
    }

    // Déterminer le niveau
    if (
      deliveriesCount >= config.level3.minDeliveries &&
      rating >= config.level3.minRating
    ) {
      return {
        level: 'elite',
        number: 3,
        paymentDelayHours: config.level3.paymentDelayHours,
        bonusPerDelivery: config.level3.bonusPerDelivery,
        emoji: '👑',
        name: 'Livreur Élite'
      };
    } else if (
      deliveriesCount >= config.level2.minDeliveries &&
      rating >= config.level2.minRating
    ) {
      return {
        level: 'confirmed',
        number: 2,
        paymentDelayHours: config.level2.paymentDelayHours,
        bonusPerDelivery: config.level2.bonusPerDelivery,
        emoji: '⭐',
        name: 'Livreur Confirmé'
      };
    } else {
      return {
        level: 'beginner',
        number: 1,
        paymentDelayHours: config.level1.paymentDelayHours,
        bonusPerDelivery: config.level1.bonusPerDelivery,
        emoji: '👶',
        name: 'Livreur Débutant'
      };
    }

  } catch (error) {
    console.error('Erreur détermination niveau:', error);
    return getDefaultLevel(0, 0);
  }
}

// Config par défaut
function getDefaultLevel(deliveriesCount, rating) {
  if (deliveriesCount >= 100 && rating >= 4.7) {
    return {
      level: 'elite',
      number: 3,
      paymentDelayHours: 0,
      bonusPerDelivery: 5,
      emoji: '👑',
      name: 'Livreur Élite'
    };
  } else if (deliveriesCount >= 50 && rating >= 4.0) {
    return {
      level: 'confirmed',
      number: 2,
      paymentDelayHours: 24,
      bonusPerDelivery: 1,
      emoji: '⭐',
      name: 'Livreur Confirmé'
    };
  } else {
    return {
      level: 'beginner',
      number: 1,
      paymentDelayHours: 48,
      bonusPerDelivery: 0,
      emoji: '👶',
      name: 'Livreur Débutant'
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FONCTION: Débloquer le paiement basé sur le niveau
// ═════════════════════════════════════════════════════════════════════════════

async function releasePaymentByLevel(deliveryId, livreurId, createdAt) {
  try {
    // console.log('🟢 Vérification déblocage paiement:', { deliveryId, livreurId });

    // Récupérer le niveau du livreur
    const livreurLevel = await getLivreurLevel(livreurId);
    // console.log('📊 Niveau livreur:', livreurLevel);

    // Calculer le temps écoulé
    const currentTime = new Date();
    const creationTime = new Date(createdAt);
    const elapsedHours = (currentTime - creationTime) / (1000 * 60 * 60);

    // console.log(`⏱️ Temps écoulé: ${elapsedHours.toFixed(1)}h / Délai requis: ${livreurLevel.paymentDelayHours}h`);

    // Vérifier si le délai est respecté
    if (elapsedHours < livreurLevel.paymentDelayHours) {
      // console.log('⏳ Pas encore le moment - attendre');
      return {
        success: false,
        message: `Paiement débloqué dans ${(livreurLevel.paymentDelayHours - elapsedHours).toFixed(1)}h`,
        remainingHours: livreurLevel.paymentDelayHours - elapsedHours,
        level: livreurLevel
      };
    }

    // ✅ DÉBLOQUER LE PAIEMENT
    // console.log('✅ Déblocage du paiement!');

    const { error: updateError } = await supabase
      .from('wallet')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        livreur_level: livreurLevel.level
      })
      .eq('delivery_id', deliveryId)
      .eq('type', 'delivery_payment');

    if (updateError) throw updateError;

    // Ajouter le bonus du niveau
    if (livreurLevel.bonusPerDelivery > 0) {
      const { error: bonusError } = await supabase
        .from('wallet')
        .insert({
          user_id: livreurId,
          type: 'level_bonus',
          amount: livreurLevel.bonusPerDelivery,
          delivery_id: deliveryId,
          livreur_level: livreurLevel.level,
          created_at: new Date().toISOString()
        });

      if (bonusError) console.warn('⚠️ Erreur bonus:', bonusError);
      // console.log(`💰 Bonus ${livreurLevel.level} ajouté: $${livreurLevel.bonusPerDelivery}`);
    }

    // Mettre à jour la transaction
    const { error: txError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        livreur_level: livreurLevel.level
      })
      .eq('delivery_id', deliveryId);

    if (txError) console.warn('⚠️ Erreur transaction:', txError);

    return {
      success: true,
      message: `Paiement débloqué (${livreurLevel.name})`,
      level: livreurLevel,
      bonusApplied: livreurLevel.bonusPerDelivery
    };

  } catch (error) {
    console.error('❌ Erreur déblocage:', error);
    return { success: false, error: error.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// FONCTION: Cron job (à exécuter toutes les heures)
// ═════════════════════════════════════════════════════════════════════════════

async function processAllPendingPayments() {
  try {
    // console.log('🔄 Traitement des paiements en attente...');

    // Récupérer tous les paiements en "pending"
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('wallet')
      .select('id, user_id, delivery_id, created_at')
      .eq('type', 'delivery_payment')
      .eq('status', 'pending');

    if (fetchError) throw fetchError;

    // console.log(`📊 Trouvé ${pendingPayments.length} paiements en attente`);

    let releasedCount = 0;

    // Traiter chaque paiement
    for (const payment of pendingPayments) {
      const result = await releasePaymentByLevel(
        payment.delivery_id,
        payment.user_id,
        payment.created_at
      );

      if (result.success) {
        releasedCount++;
        // console.log(`✅ Paiement ${payment.delivery_id} débloqué (${result.level.name})`);
      } else {
        // console.log(`⏳ Paiement ${payment.delivery_id} - ${result.message}`);
      }
    }

    // console.log(`🎉 ${releasedCount}/${pendingPayments.length} paiements débloqués`);

    return { success: true, releasedCount, totalPending: pendingPayments.length };

  } catch (error) {
    console.error('❌ Erreur cron job:', error);
    return { success: false, error: error.message };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ENDPOINT: GET /api/livreur-level?user_id=xxx
// ═════════════════════════════════════════════════════════════════════════════

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { user_id, delivery_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id required' });
      }

      // Récupérer le niveau
      const level = await getLivreurLevel(user_id);

      // Si delivery_id fourni, vérifier le déblocage
      if (delivery_id) {
        const release = await releasePaymentByLevel(delivery_id, user_id, new Date());
        return res.status(200).json({
          level,
          paymentStatus: release
        });
      }

      return res.status(200).json({ level });

    } catch (error) {
      console.error('Erreur API:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Cron job endpoint (à appeler via Vercel cron)
  if (req.method === 'POST') {
    try {
      const result = await processAllPendingPayments();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Erreur cron:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// ═════════════════════════════════════════════════════════════════════════════
// INTÉGRATION AVEC SUPABASE
// ═════════════════════════════════════════════════════════════════════════════

/*

CREATE TABLE livreur_levels_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level1 JSONB DEFAULT '{
    "minDeliveries": 0,
    "maxDeliveries": 50,
    "minRating": 0,
    "paymentDelayHours": 48,
    "bonusPerDelivery": 0
  }',
  level2 JSONB DEFAULT '{
    "minDeliveries": 50,
    "maxDeliveries": 100,
    "minRating": 4.0,
    "paymentDelayHours": 24,
    "bonusPerDelivery": 1
  }',
  level3 JSONB DEFAULT '{
    "minDeliveries": 100,
    "maxDeliveries": 999999,
    "minRating": 4.7,
    "paymentDelayHours": 0,
    "bonusPerDelivery": 5
  }',
  updated_at TIMESTAMP DEFAULT NOW()
);

*/

// ═════════════════════════════════════════════════════════════════════════════
// CONFIGURATION VERCEL CRON
// ═════════════════════════════════════════════════════════════════════════════

/*

Fichier: vercel.json

{
  "crons": [{
    "path": "/api/livreur-levels-release",
    "schedule": "0 * * * *"
  }]
}

Cela exécute le cron job toutes les heures pour débloquer les paiements
qui ont complété leur délai d'attente!

*/

