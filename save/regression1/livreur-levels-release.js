// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYSTÃˆME DÃ‰BLOCAGE AUTOMATIQUE PAR NIVEAUX - PorteÃ Porte
// Fichier: api/livreur-levels-release.js (Ã€ copier dans Vercel)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FONCTION: DÃ©terminer le niveau du livreur
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function getLivreurLevel(livreurId) {
  try {
    // RÃ©cupÃ©rer le profil du livreur
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('livraisons, score')
      .eq('id', livreurId)
      .single();

    if (profileError) throw profileError;

    const deliveriesCount = profile.livraisons || 0;
    const rating = profile.score || 0;

    // RÃ©cupÃ©rer la config
    const { data: config, error: configError } = await supabase
      .from('livreur_levels_config')
      .select('*')
      .single();

    if (configError) {
      console.warn('Config non trouvÃ©e, utiliser dÃ©faut');
      return getDefaultLevel(deliveriesCount, rating);
    }

    // DÃ©terminer le niveau
    if (
      deliveriesCount >= config.level3.minDeliveries &&
      rating >= config.level3.minRating
    ) {
      return {
        level: 'elite',
        number: 3,
        paymentDelayHours: config.level3.paymentDelayHours,
        bonusPerDelivery: config.level3.bonusPerDelivery,
        emoji: 'ðŸ‘‘',
        name: 'Livreur Ã‰lite'
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
        emoji: 'â­',
        name: 'Livreur ConfirmÃ©'
      };
    } else {
      return {
        level: 'beginner',
        number: 1,
        paymentDelayHours: config.level1.paymentDelayHours,
        bonusPerDelivery: config.level1.bonusPerDelivery,
        emoji: 'ðŸ‘¶',
        name: 'Livreur DÃ©butant'
      };
    }

  } catch (error) {
    console.error('Erreur dÃ©termination niveau:', error);
    return getDefaultLevel(0, 0);
  }
}

// Config par dÃ©faut
function getDefaultLevel(deliveriesCount, rating) {
  if (deliveriesCount >= 100 && rating >= 4.7) {
    return {
      level: 'elite',
      number: 3,
      paymentDelayHours: 0,
      bonusPerDelivery: 5,
      emoji: 'ðŸ‘‘',
      name: 'Livreur Ã‰lite'
    };
  } else if (deliveriesCount >= 50 && rating >= 4.0) {
    return {
      level: 'confirmed',
      number: 2,
      paymentDelayHours: 24,
      bonusPerDelivery: 1,
      emoji: 'â­',
      name: 'Livreur ConfirmÃ©'
    };
  } else {
    return {
      level: 'beginner',
      number: 1,
      paymentDelayHours: 48,
      bonusPerDelivery: 0,
      emoji: 'ðŸ‘¶',
      name: 'Livreur DÃ©butant'
    };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FONCTION: DÃ©bloquer le paiement basÃ© sur le niveau
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function releasePaymentByLevel(deliveryId, livreurId, createdAt) {
  try {
    // console.log('ðŸŸ¢ VÃ©rification dÃ©blocage paiement:', { deliveryId, livreurId });

    // RÃ©cupÃ©rer le niveau du livreur
    const livreurLevel = await getLivreurLevel(livreurId);
    // console.log('ðŸ“Š Niveau livreur:', livreurLevel);

    // Calculer le temps Ã©coulÃ©
    const currentTime = new Date();
    const creationTime = new Date(createdAt);
    const elapsedHours = (currentTime - creationTime) / (1000 * 60 * 60);

    // console.log(`â±ï¸ Temps Ã©coulÃ©: ${elapsedHours.toFixed(1)}h / DÃ©lai requis: ${livreurLevel.paymentDelayHours}h`);

    // VÃ©rifier si le dÃ©lai est respectÃ©
    if (elapsedHours < livreurLevel.paymentDelayHours) {
      // console.log('â³ Pas encore le moment - attendre');
      return {
        success: false,
        message: `Paiement dÃ©bloquÃ© dans ${(livreurLevel.paymentDelayHours - elapsedHours).toFixed(1)}h`,
        remainingHours: livreurLevel.paymentDelayHours - elapsedHours,
        level: livreurLevel
      };
    }

    // âœ… DÃ‰BLOQUER LE PAIEMENT
    // console.log('âœ… DÃ©blocage du paiement!');

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

      if (bonusError) console.warn('âš ï¸ Erreur bonus:', bonusError);
      // console.log(`ðŸ’° Bonus ${livreurLevel.level} ajoutÃ©: $${livreurLevel.bonusPerDelivery}`);
    }

    // Mettre Ã  jour la transaction
    const { error: txError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        livreur_level: livreurLevel.level
      })
      .eq('delivery_id', deliveryId);

    if (txError) console.warn('âš ï¸ Erreur transaction:', txError);

    return {
      success: true,
      message: `Paiement dÃ©bloquÃ© (${livreurLevel.name})`,
      level: livreurLevel,
      bonusApplied: livreurLevel.bonusPerDelivery
    };

  } catch (error) {
    console.error('âŒ Erreur dÃ©blocage:', error);
    return { success: false, error: error.message };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FONCTION: Cron job (Ã  exÃ©cuter toutes les heures)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

async function processAllPendingPayments() {
  try {
    // console.log('ðŸ”„ Traitement des paiements en attente...');

    // RÃ©cupÃ©rer tous les paiements en "pending"
    const { data: pendingPayments, error: fetchError } = await supabase
      .from('wallet')
      .select('id, user_id, delivery_id, created_at')
      .eq('type', 'delivery_payment')
      .eq('status', 'pending');

    if (fetchError) throw fetchError;

    // console.log(`ðŸ“Š TrouvÃ© ${pendingPayments.length} paiements en attente`);

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
        // console.log(`âœ… Paiement ${payment.delivery_id} dÃ©bloquÃ© (${result.level.name})`);
      } else {
        // console.log(`â³ Paiement ${payment.delivery_id} - ${result.message}`);
      }
    }

    // console.log(`ðŸŽ‰ ${releasedCount}/${pendingPayments.length} paiements dÃ©bloquÃ©s`);

    return { success: true, releasedCount, totalPending: pendingPayments.length };

  } catch (error) {
    console.error('âŒ Erreur cron job:', error);
    return { success: false, error: error.message };
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENDPOINT: GET /api/livreur-level?user_id=xxx
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { user_id, delivery_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id required' });
      }

      // RÃ©cupÃ©rer le niveau
      const level = await getLivreurLevel(user_id);

      // Si delivery_id fourni, vÃ©rifier le dÃ©blocage
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

  // Cron job endpoint (Ã  appeler via Vercel cron)
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INTÃ‰GRATION AVEC SUPABASE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONFIGURATION VERCEL CRON
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/*

Fichier: vercel.json

{
  "crons": [{
    "path": "/api/livreur-levels-release",
    "schedule": "0 * * * *"
  }]
}

Cela exÃ©cute le cron job toutes les heures pour dÃ©bloquer les paiements
qui ont complÃ©tÃ© leur dÃ©lai d'attente!

*/

