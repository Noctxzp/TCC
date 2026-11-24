// CADASTRO DE USUÁRIOS E RESERVAS COM PAGAMENTO PIX //

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { gerarPixCopiaECola } = require("./pix");

const app = express();

// ---------- CORS ----------

// Sites que podem chamar esta API pelo navegador.
// Em produção, defina ORIGENS_PERMITIDAS (separadas por vírgula).
const origensPermitidas = (process.env.ORIGENS_PERMITIDAS || "http://localhost:5500,http://127.0.0.1:5500")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Sem "origin" = curl, Postman ou chamadas de servidor (não é um site no navegador)
    if (!origin || origensPermitidas.includes(origin)) return callback(null, true);
    callback(null, false);
  },
  methods: ["GET", "POST", "DELETE", "PATCH"]
}));

app.use(express.json());

// ---------- CONFIGURAÇÃO ----------

const PRECO_DIARIA = Number(process.env.PRECO_DIARIA || 1500);
const PRAZO_PAGAMENTO_MIN = Number(process.env.PRAZO_PAGAMENTO_MIN || 30);
const ADMIN_CHAVE = process.env.ADMIN_CHAVE || "";
const pixConfigurado = Boolean(process.env.PIX_CHAVE && process.env.PIX_NOME && process.env.PIX_CIDADE);

if (!(PRECO_DIARIA > 0) || !(PRAZO_PAGAMENTO_MIN > 0)) {
  console.error("PRECO_DIARIA e PRAZO_PAGAMENTO_MIN precisam ser números maiores que zero.");
  process.exit(1);
}
if (!pixConfigurado) {
  console.log("Pagamento Pix desativado (defina PIX_CHAVE, PIX_NOME e PIX_CIDADE). Reservas serão recusadas.");
}
if (!ADMIN_CHAVE) {
  console.log("Área administrativa desativada (defina ADMIN_CHAVE).");
}

// ---------- ÁREA ADMINISTRATIVA (chave no cabeçalho x-admin-key) ----------

function exigirAdmin(req, res, next) {
  if (!ADMIN_CHAVE) {
    return res.status(503).json({ erro: "Área administrativa desativada (defina ADMIN_CHAVE)." });
  }
  const enviada = Buffer.from(String(req.get("x-admin-key") || ""));
  const esperada = Buffer.from(ADMIN_CHAVE);
  if (enviada.length !== esperada.length || !crypto.timingSafeEqual(enviada, esperada)) {
    return res.status(401).json({ erro: "Não autorizado." });
  }
  next();
}

// ---------- AVISO DE NOVA RESERVA POR WHATSAPP (CallMeBot) ----------

const whatsappConfigurado = Boolean(process.env.WHATSAPP_FONE && process.env.WHATSAPP_APIKEY);

if (!whatsappConfigurado) {
  console.log("Aviso por WhatsApp desativado (defina WHATSAPP_FONE e WHATSAPP_APIKEY).");
}

// Envia em segundo plano: se o WhatsApp falhar, a reserva continua valendo.
function avisarWhatsApp(reserva) {
  if (!whatsappConfigurado) return;

  const dataBR = reserva.data.split("-").reverse().join("/");
  const texto =
    `*Nova reserva AGUARDANDO PAGAMENTO - Nino Clube*\n` +
    `Espaço: ${reserva.espaco}\n` +
    `Data: ${dataBR}\n` +
    `Valor: R$ ${reserva.valor.toFixed(2).replace(".", ",")}\n` +
    `Nome: ${String(reserva.nome).slice(0, 80)}\n` +
    `Telefone: ${String(reserva.telefone).slice(0, 30)}\n` +
    `Código: ${reserva.id}`;

  const params = new URLSearchParams({
    phone: process.env.WHATSAPP_FONE,
    text: texto,
    apikey: process.env.WHATSAPP_APIKEY
  });

  fetch("https://api.callmebot.com/whatsapp.php?" + params.toString())
    .then(resp => {
      if (resp.ok) console.log(`WhatsApp de aviso enviado (reserva ${reserva.id}).`);
      else console.error(`Falha no aviso por WhatsApp: status ${resp.status}.`);
    })
    .catch(err => console.error("Falha no aviso por WhatsApp:", err.message));
}

// ---------- USUÁRIOS (somente administrador) ----------

app.use("/usuarios", exigirAdmin);

let usuarios = [
  { id: 1, nome: "Richard Teixeira", email: "richard@gmail.com", telefone: "11987563468", criadoEm: new Date() },
  { id: 2, nome: "Noemy portapilla", email: "noemy@gmail.com", telefone: "11934567896", criadoEm: new Date() },
  { id: 3, nome: "Anthony Ferreira Rosembauer", email: "anthonyferreira@gmail.com", telefone: "11994207516", criadoEm: new Date() },
  { id: 4, nome: "Leandro Pereira", email: "leandro@gmail.com", telefone: "11987654321", criadoEm: new Date() },
  { id: 5, nome: "Guilherme Galdino", email: "guilherme@gmail.com", telefone: "11934209876", criadoEm: new Date() },
];

let proximoId = Math.max(...usuarios.map(u => u.id)) + 1;

app.get("/usuarios", (req, res) => {
  res.json(usuarios);
});

app.get("/usuarios/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = usuarios.find(u => u.id === id);

  if (!user) return res.status(404).json({ erro: "Usuário não encontrado." });
  res.json(user);
});

app.post("/usuarios", (req, res) => {
  const { nome, email, telefone } = req.body || {};

  if (!nome || !email || !telefone) {
    return res.status(400).json({ erro: "nome, email e telefone são obrigatórios." });
  }
  if (usuarios.some(u => u.email === email)) {
    return res.status(409).json({ erro: "E-mail já cadastrado." });
  }

  const user = { id: proximoId++, nome, email, telefone, criadoEm: new Date() };
  usuarios.push(user);
  res.status(201).json(user);
});

app.delete("/usuarios/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = usuarios.findIndex(u => u.id === id);

  if (index === -1) return res.status(404).json({ erro: "Usuário não encontrado." });

  usuarios.splice(index, 1);
  res.json({ mensagem: "Usuário removido." });
});

// ---------- RESERVAS ----------

const ESPACOS = ["Chácara Riveira", "Vila Gilda"];

let reservas = [];
let proximaReservaId = 1;

// Data de hoje no formato AAAA-MM-DD (horário local)
function hojeISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Confere se a string é uma data real no formato AAAA-MM-DD
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [ano, mes, dia] = texto.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia);
  return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// "confirmada" | "aguardando_pagamento" | "expirada"
function situacao(r) {
  if (r.status === "confirmada") return "confirmada";
  return new Date(r.expiraEm).getTime() > Date.now() ? "aguardando_pagamento" : "expirada";
}

function ocupaData(r) {
  return situacao(r) !== "expirada";
}

function visaoAdmin(r) {
  return { ...r, situacao: situacao(r) };
}

// Público: só espaço e data das reservas que ocupam a agenda (sem nome nem telefone)
app.get("/reservas", (req, res) => {
  const { espaco } = req.query;
  let lista = reservas.filter(ocupaData);
  if (espaco) lista = lista.filter(r => r.espaco === espaco);
  res.json(lista.map(r => ({ espaco: r.espaco, data: r.data })));
});

// Público: cria a reserva (aguardando pagamento) e devolve o Pix
app.post("/reservas", async (req, res) => {
  if (!pixConfigurado) {
    return res.status(503).json({ erro: "Pagamento ainda não está configurado. Tente mais tarde." });
  }

  const { nome, telefone, espaco, data } = req.body || {};

  if (typeof nome !== "string" || typeof telefone !== "string" ||
      typeof espaco !== "string" || typeof data !== "string" ||
      !nome.trim() || !telefone.trim() || !espaco || !data) {
    return res.status(400).json({ erro: "nome, telefone, espaco e data são obrigatórios." });
  }
  if (nome.length > 80 || telefone.length > 30) {
    return res.status(400).json({ erro: "Nome ou telefone grande demais." });
  }
  if (!ESPACOS.includes(espaco)) {
    return res.status(400).json({ erro: `Espaço inválido. Use: ${ESPACOS.join(" ou ")}.` });
  }
  if (!dataValida(data)) {
    return res.status(400).json({ erro: "Data inválida. Use o formato AAAA-MM-DD." });
  }
  if (data < hojeISO()) {
    return res.status(400).json({ erro: "Não é possível reservar uma data que já passou." });
  }
  if (reservas.some(r => r.espaco === espaco && r.data === data && ocupaData(r))) {
    return res.status(409).json({ erro: "Esse espaço já está reservado nessa data." });
  }

  const reserva = {
    id: proximaReservaId++,
    nome: nome.trim(),
    telefone: telefone.trim(),
    espaco,
    data,
    valor: PRECO_DIARIA,
    status: "aguardando_pagamento",
    expiraEm: new Date(Date.now() + PRAZO_PAGAMENTO_MIN * 60 * 1000).toISOString(),
    criadoEm: new Date().toISOString()
  };

  // Entra na lista antes do "await", para ninguém pegar a mesma data ao mesmo tempo
  reservas.push(reserva);

  try {
    const pixCopiaECola = gerarPixCopiaECola({
      chave: process.env.PIX_CHAVE,
      valor: reserva.valor,
      nome: process.env.PIX_NOME,
      cidade: process.env.PIX_CIDADE,
      txid: `NINO${reserva.id}`
    });
    const qrCode = await QRCode.toDataURL(pixCopiaECola, { margin: 1, width: 300 });

    avisarWhatsApp(reserva);

    res.status(201).json({
      id: reserva.id,
      espaco: reserva.espaco,
      data: reserva.data,
      valor: reserva.valor,
      status: situacao(reserva),
      expiraEm: reserva.expiraEm,
      pixCopiaECola,
      qrCode
    });
  } catch (err) {
    reservas = reservas.filter(r => r.id !== reserva.id);
    console.error("Erro ao gerar o Pix:", err.message);
    res.status(500).json({ erro: "Não foi possível gerar o pagamento. Tente novamente." });
  }
});

// ---------- ADMINISTRAÇÃO DE RESERVAS ----------

app.get("/admin/reservas", exigirAdmin, (req, res) => {
  res.json(reservas.map(visaoAdmin));
});

// Confirmar depois de ver o dinheiro na conta
app.patch("/admin/reservas/:id/confirmar", exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  const reserva = reservas.find(r => r.id === id);

  if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada." });
  if (situacao(reserva) === "confirmada") return res.json(visaoAdmin(reserva));

  // Se já expirou, só reativa se a data ainda estiver livre
  const conflito = reservas.some(r =>
    r.id !== reserva.id && r.espaco === reserva.espaco && r.data === reserva.data && ocupaData(r)
  );
  if (conflito) {
    return res.status(409).json({
      erro: "Essa data já foi ocupada por outra reserva. Devolva o pagamento a este cliente."
    });
  }

  reserva.status = "confirmada";
  reserva.confirmadaEm = new Date().toISOString();
  res.json(visaoAdmin(reserva));
});

// Cancelar / remover
app.delete("/admin/reservas/:id", exigirAdmin, (req, res) => {
  const id = Number(req.params.id);
  const index = reservas.findIndex(r => r.id === id);

  if (index === -1) return res.status(404).json({ erro: "Reserva não encontrada." });

  reservas.splice(index, 1);
  res.json({ mensagem: "Reserva removida." });
});

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));

