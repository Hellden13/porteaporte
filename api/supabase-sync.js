// api/supabase-sync.js â PorteÃ Porte
// Pieds en L'air S.E.N.C. â Denis Morneau â LÃ©vis QC
// Sans dÃ©pendances externes â fetch natif uniquement

const CORS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://porteaporte.site',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

const NE = [
  {nom:'Voisin', min:0,   max:19,  commission_rabais:0,    pc_par_envoi:10},
  {nom:'HabituÃ©',min:20,  max:49,  commission_rabais:0.05, pc_par_envoi:12},
  {nom:'FidÃ¨le', min:50,  max:99,  commission_rabais:0.10, pc_par_envoi:15},
  {nom:'VIP',    min:100, max:9999,commission_rabais:0.15, pc_par_envoi:20},
];
const NL = [
  {nom:'Bronze',min:0,   max:999,    mult:1.0},
  {nom:'Argent',min:1000,max:2499,   mult:1.1},
  {nom:'Or',    min:2500,max:4999,   mult:1.25},
  {nom:'Ãlite', min:5000,max:9999999,mult:1.5},
];

function getNiveau(arr, val) {
  return arr.find(n => val >= n.min && val <= n.max) || arr[0];
}

function sbH(key) {
  return {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

async function getSessionUser(req, base, key) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;

  const r = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`
    }
  });
  if (!r.ok) return null;
  return r.json();
}

async function requireAdmin(session, base, key, optional = false) {
  if (!session) {
    return optional
      ? { ok: false, status: 401, error: 'Session requise' }
      : { ok: false, status: 401, error: 'Session admin requise' };
  }

  const r = await fetch(`${base}/rest/v1/profiles?id=eq.${session.id}&select=role`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  const rows = r.ok ? await r.json() : [];
  if (rows[0]?.role !== 'admin') return { ok: false, status: 403, error: 'Role admin requis' };
  return { ok: true };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k,v));
  if (req.method !== 'POST') return res.status(405).json({error:'MÃ©thode non autorisÃ©e'});

  // Accepter SUPABASE_SERVICE_KEY OU SUPABASE_ANON_KEY comme fallback
  const SB  = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SB || !KEY) {
    return res.status(503).json({error:'Supabase non configurÃ©', env_missing:true,
      hint:'Ajouter SUPABASE_URL et SUPABASE_SERVICE_KEY dans Vercel Environment Variables'});
  }

  const BASE = SB.replace(/\/rest\/v1\/?$/, '');
  const {action, ...p} = req.body || {};
  const session = await getSessionUser(req, BASE, KEY);

  async function sbGet(table, query) {
    const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, {headers: sbH(KEY)});
    if (!r.ok) throw new Error(`SB GET ${table} ${r.status}: ${await r.text()}`);
    return r.json();
  }
  async function sbPost(table, body) {
    const r = await fetch(`${BASE}/rest/v1/${table}`, {
      method:'POST', headers: sbH(KEY), body: JSON.stringify(body)
    });
    if (!r.ok && r.status !== 201) throw new Error(`SB POST ${table} ${r.status}: ${await r.text()}`);
    return r.json().catch(() => ({}));
  }
  async function sbPatch(table, query, body) {
    const h = {...sbH(KEY), 'Prefer':'return=minimal'};
    const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, {
      method:'PATCH', headers: h, body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(`SB PATCH ${table} ${r.status}: ${await r.text()}`);
    return {};
  }

  try {
    switch (action) {

      case 'upsert_profil': {
        const {user_id, prenom, nom, role, ville, email, parrain_code} = p;
        if (!user_id) return res.status(400).json({error:'user_id requis'});
        if (!session || session.id !== user_id) return res.status(401).json({error:'Session utilisateur requise'});
        const profil = {
          id:user_id, prenom:prenom||'', nom:nom||'', role:role||'expediteur',
          ville:ville||'', email:email||'', coins:50, xp:50, livraisons:0, envois:0,
          niveau_expediteur:'Voisin', niveau_livreur:'Bronze', score_confiance:75,
          certifie:false, cree_le:new Date().toISOString(), mis_a_jour:new Date().toISOString(),
        };
        const h2 = {...sbH(KEY), 'Prefer':'return=representation,resolution=merge-duplicates'};
        const r = await fetch(`${BASE}/rest/v1/profiles`, {
          method:'POST', headers:h2, body:JSON.stringify(profil)
        });
        const data = await r.json().catch(()=>({}));
        await sbPost('transactions', {
          user_id, type:'bonus_bienvenue', montant_coins:50,
          description:'ð Bonus bienvenue', cree_le:new Date().toISOString(),
        }).catch(()=>{});
        if (parrain_code) {
          const pars = await sbGet('profiles', `code_pp=ilike.${parrain_code}&select=id,coins,prenom&limit=1`).catch(()=>[]);
          if (pars[0]) {
            const par = pars[0];
            await sbPatch('profiles', `id=eq.${par.id}`, {coins:(par.coins||0)+250}).catch(()=>{});
            await sbPost('transactions', [
              {user_id:par.id, type:'parrainage_recu', montant_coins:250, description:'ð¤ Parrainage', cree_le:new Date().toISOString()},
              {user_id, type:'parrainage_bonus', montant_coins:50, description:'ð¤ Bonus parrainage â '+par.prenom, cree_le:new Date().toISOString()},
            ]).catch(()=>{});
          }
        }
        return res.status(200).json({success:true, profil:Array.isArray(data)?data[0]:data, coins_offerts:50});
      }

      case 'livraison_complete': {
        const adminCheck = await requireAdmin(session, BASE, KEY);
        if (!adminCheck.ok) return res.status(adminCheck.status).json({error:adminCheck.error});

        const {user_id, role, colis_id, avis_recu=4} = p;
        if (!user_id||!role) return res.status(400).json({error:'user_id et role requis'});
        const profs = await sbGet('profiles', `id=eq.${user_id}&select=coins,xp,livraisons,envois,score_confiance&limit=1`);
        if (!profs[0]) return res.status(404).json({error:'Profil introuvable'});
        const prof = profs[0];
        let u = {mis_a_jour:new Date().toISOString()}, cg=0, xg=0, txs=[];
        if (role === 'livreur') {
          xg = avis_recu >= 5 ? 100 : 75;
          const nx = (prof.xp||0)+xg;
          const nv = getNiveau(NL, nx);
          cg = Math.round(15*nv.mult);
          u = {...u, xp:nx, livraisons:(prof.livraisons||0)+1, coins:(prof.coins||0)+cg,
            niveau_livreur:nv.nom,
            score_confiance:Math.min(100,Math.round((prof.score_confiance||75)*0.9+(avis_recu||4)*20*0.1))};
          txs.push({user_id, type:'livraison_effectuee', montant_coins:cg,
            description:`ð Livraison Â· ${colis_id||''}`, cree_le:new Date().toISOString()});
        } else {
          const ne = (prof.envois||0)+1;
          const nv = getNiveau(NE, ne);
          cg = nv.pc_par_envoi; xg = 50;
          u = {...u, coins:(prof.coins||0)+cg, xp:(prof.xp||0)+xg, envois:ne, niveau_expediteur:nv.nom};
          txs.push({user_id, type:'envoi_complete', montant_coins:cg,
            description:`ð¦ Colis Â· ${colis_id||''}`, cree_le:new Date().toISOString()});
        }
        await sbPatch('profiles', `id=eq.${user_id}`, u);
        if (txs.length) await sbPost('transactions', txs).catch(()=>{});
        return res.status(200).json({success:true, coins_gagnes:cg, xp_gagne:xg,
          nouveau_solde_coins:u.coins, niveau_expediteur:u.niveau_expediteur,
          niveau_livreur:u.niveau_livreur});
      }

      case 'modifier_coins': {
        const adminCheck = await requireAdmin(session, BASE, KEY);
        if (!adminCheck.ok) return res.status(adminCheck.status).json({error:adminCheck.error});

        const {user_id, montant, description, type='ajustement'} = p;
        if (!user_id||montant===undefined) return res.status(400).json({error:'user_id et montant requis'});
        const profs = await sbGet('profiles', `id=eq.${user_id}&select=coins&limit=1`);
        const coins = (profs[0]?.coins||0);
        const nouveau = Math.max(0, coins+montant);
        await sbPatch('profiles', `id=eq.${user_id}`, {coins:nouveau, mis_a_jour:new Date().toISOString()});
        await sbPost('transactions', {user_id, type, montant_coins:montant,
          description:description||(montant>0?'+ Coins ajoutÃ©s':'- Coins dÃ©duits'),
          cree_le:new Date().toISOString()}).catch(()=>{});
        return res.status(200).json({success:true, nouveau_solde:nouveau, delta:montant});
      }

      case 'transfert_coins': {
        const {user_id_source, code_destinataire, montant} = p;
        if (!user_id_source||!code_destinataire||!montant) return res.status(400).json({error:'ParamÃ¨tres manquants'});
        if (!session || session.id !== user_id_source) return res.status(401).json({error:'Session source requise'});
        if (montant<10||montant>1000) return res.status(400).json({error:'Montant entre 10 et 1000 PC'});
        const dests = await sbGet('profiles', `code_pp=ilike.${code_destinataire}&select=id,prenom,coins&limit=1`);
        if (!dests[0]) return res.status(404).json({error:'Destinataire introuvable'});
        const dest = dests[0];
        const srcs = await sbGet('profiles', `id=eq.${user_id_source}&select=coins,prenom&limit=1`);
        if (!srcs[0]) return res.status(404).json({error:'ExpÃ©diteur introuvable'});
        const src = srcs[0];
        if ((src.coins||0)<montant) return res.status(400).json({error:'Solde insuffisant'});
        await Promise.all([
          sbPatch('profiles', `id=eq.${user_id_source}`, {coins:src.coins-montant}),
          sbPatch('profiles', `id=eq.${dest.id}`, {coins:(dest.coins||0)+montant}),
          sbPost('transactions', [
            {user_id:user_id_source, type:'transfert_sortant', montant_coins:-montant,
              description:`ð Transfert â ${dest.prenom}`, cree_le:new Date().toISOString()},
            {user_id:dest.id, type:'transfert_entrant', montant_coins:montant,
              description:`ð Transfert reÃ§u de ${src.prenom}`, cree_le:new Date().toISOString()},
          ]),
        ]);
        return res.status(200).json({success:true, montant_transfere:montant,
          destinataire:dest.prenom, nouveau_solde_source:src.coins-montant});
      }

      case 'get_profil': {
        const {user_id} = p;
        if (!user_id) return res.status(400).json({error:'user_id requis'});
        const adminCheck = await requireAdmin(session, BASE, KEY, true);
        if (!session || (session.id !== user_id && !adminCheck.ok)) return res.status(403).json({error:'Acces profil refuse'});
        const profs = await sbGet('profiles', `id=eq.${user_id}&limit=1`);
        if (!profs[0]) return res.status(404).json({error:'Profil introuvable'});
        const profil = profs[0];
        const envois = profil.envois||0, xp = profil.xp||0;
        const ne = getNiveau(NE, envois);
        const nl = getNiveau(NL, xp);
        const nne = NE[NE.indexOf(ne)+1];
        return res.status(200).json({success:true, profil,
          fidelite:{niveau_nom:ne.nom, envois, restant:nne?nne.min-envois:0,
            commission_rabais:ne.commission_rabais, pc_par_envoi:ne.pc_par_envoi},
          xp_livreur:{niveau_nom:nl.nom, xp, multiplicateur:nl.mult}});
      }

      default:
        return res.status(400).json({error:`Action inconnue: ${action}`});
    }
  } catch(err) {
    console.error('[supabase-sync]', err.message);
    return res.status(500).json({error:'Erreur serveur', details:err.message});
  }
};
