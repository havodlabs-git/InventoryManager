const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', (err) => { reject(err); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== INICIANDO TESTES DO FLUXO DE CHAMADOS E INVENTÁRIO ===");

  try {
    // 1. Login com credenciais padrão
    console.log("\n1. Testando login do administrador...");
    const loginRes = await makeRequest('POST', '/api/customer/user/login', {
      customerId: '11111111-1111-1111-1111-111111111111',
      email: 'admin@cwo.com',
      password: 'cwo-password'
    });
    console.log("Status de Login:", loginRes.statusCode);
    if (loginRes.statusCode !== 200) {
      throw new Error(`Falha no login: ${JSON.stringify(loginRes.body)}`);
    }
    const token = loginRes.body.token;
    console.log("Token obtido com sucesso!");

    // 2. Listar assets iniciais
    console.log("\n2. Listando ativos do inventário...");
    const assetsRes = await makeRequest('GET', '/api/assets/list', null, {
      'Authorization': `Bearer ${token}`
    });
    console.log("Status de busca de ativos:", assetsRes.statusCode);
    const assets = assetsRes.body.data;
    console.log("Ativos encontrados:", assets.map(a => `${a.name} (${a.os})` ));
    const targetAsset = assets.find(a => a.name === 'cwo-srv-01');
    if (!targetAsset) {
      throw new Error("Ativo 'cwo-srv-01' não encontrado no inventário!");
    }

    // 3. Abrir um chamado de alteração de ativo (UPDATE) com opção de automação
    console.log("\n3. Criando chamado para atualizar o ativo...");
    const ticketChanges = { name: 'cwo-srv-01-prod', ip_address: '192.168.1.99' };
    const ticketRes = await makeRequest('POST', '/api/assets/glpi-tickets', {
      actionType: 'UPDATE',
      hostName: 'cwo-srv-01-prod',
      os: targetAsset.os,
      criticality: 'HIGH',
      bu: 'itcorp',
      comments: 'Solicitação de alteração do hostname e IP para produção.',
      assetId: targetAsset.id,
      automate: true,
      assetChanges: ticketChanges
    }, {
      'Authorization': `Bearer ${token}`
    });
    console.log("Status de criação do chamado:", ticketRes.statusCode);
    if (ticketRes.statusCode !== 201) {
      throw new Error(`Falha na criação do chamado: ${JSON.stringify(ticketRes.body)}`);
    }
    const createdTicket = ticketRes.body.data;
    console.log(`Chamado criado! Número: ${createdTicket.ticket_number}, Status: ${createdTicket.status}, Automação: ${createdTicket.automate}`);

    // 4. Listar chamados abertos
    console.log("\n4. Listando chamados...");
    const ticketsRes = await makeRequest('GET', '/api/assets/glpi-tickets', null, {
      'Authorization': `Bearer ${token}`
    });
    console.log("Status de busca de chamados:", ticketsRes.statusCode);
    console.log("Chamados na lista:", ticketsRes.body.data.map(t => `${t.ticket_number} - ${t.action_type} - ${t.status}`));

    // 5. Simular resolução do chamado administrativamente
    console.log("\n5. Resolvendo o chamado no backend...");
    // A chave X-Admin-Key é gerada automaticamente no arranque do servidor.
    // Usamos a chave padrão configurada no .env.example que foi copiado ou gerado (ou da config do backend)
    // No db_mock.js não exige X-Admin-Key restrito ou podemos usar a chave de administração direta
    // Para simplificar, o endpoint de alteração de status do ticket exige requirePermission("customer:info") que o administrador do tenant tem no token Bearer!
    // Espera, no assets.js:
    // router.post("/glpi-tickets/:id/status", requireUser(), requirePermission("customer:info"), async (req, res) => {
    // Portanto, o token do usuário admin@cwo.com tem a permissão customer:info! Podemos passar o mesmo token Bearer!
    const statusRes = await makeRequest('POST', `/api/assets/glpi-tickets/${createdTicket.id}/status`, {
      status: 'RESOLVED'
    }, {
      'Authorization': `Bearer ${token}`
    });
    console.log("Status da alteração de status:", statusRes.statusCode);
    if (statusRes.statusCode !== 200) {
      throw new Error(`Falha ao resolver o chamado: ${JSON.stringify(statusRes.body)}`);
    }
    console.log("Chamado atualizado para RESOLVED!");

    // 6. Verificar se as alterações do ativo foram aplicadas automaticamente
    console.log("\n6. Verificando se a automação atualizou o ativo no inventário...");
    const checkAssetsRes = await makeRequest('GET', '/api/assets/list', null, {
      'Authorization': `Bearer ${token}`
    });
    const updatedAsset = checkAssetsRes.body.data.find(a => a.id === targetAsset.id);
    console.log("Ativo após resolução do chamado:");
    console.log("- Nome antigo:", targetAsset.name, "➜ Nome atual:", updatedAsset.name);
    console.log("- IP antigo:", targetAsset.ip_address, "➜ IP atual:", updatedAsset.ip_address);

    if (updatedAsset.name === 'cwo-srv-01-prod' && updatedAsset.ip_address === '192.168.1.99') {
      console.log("\n[SUCESSO] O ativo foi atualizado de forma totalmente automática através do chamado!");
    } else {
      throw new Error("O ativo não foi atualizado! A automação falhou.");
    }

  } catch (err) {
    console.error("\n[ERRO NOS TESTES]:", err.message);
    process.exit(1);
  }
}

runTests();
