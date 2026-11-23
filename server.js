// CADASTRO DE USUÁRIOS E RESERVAS //

const express = require("express");
const cors = require("cors");
const app = express();

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
  methods: ["GET", "POST", "DELETE"]
}));
app.use(express.json());

// ---------- USUÁRIOS ----------

// Usuários cadastrados no sistema (em memória: some ao reiniciar o servidor)
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

// Listar reservas (filtros opcionais: ?espaco=Vila Gilda&data=2026-12-25)
app.get("/reservas", (req, res) => {
  const { espaco, data } = req.query;
  let lista = reservas;

  if (espaco) lista = lista.filter(r => r.espaco === espaco);
  if (data) lista = lista.filter(r => r.data === data);

  res.json(lista);
});

// Buscar uma reserva
app.get("/reservas/:id", (req, res) => {
  const id = Number(req.params.id);
  const reserva = reservas.find(r => r.id === id);

  if (!reserva) return res.status(404).json({ erro: "Reserva não encontrada." });
  res.json(reserva);
});

// Criar reserva
app.post("/reservas", (req, res) => {
  const { nome, telefone, espaco, data } = req.body || {};

  if (!nome || !telefone || !espaco || !data) {
    return res.status(400).json({ erro: "nome, telefone, espaco e data são obrigatórios." });
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
  if (reservas.some(r => r.espaco === espaco && r.data === data)) {
    return res.status(409).json({ erro: "Esse espaço já está reservado nessa data." });
  }

  const reserva = {
    id: proximaReservaId++,
    nome: nome.trim(),
    telefone: telefone.trim(),
    espaco,
    data,
    criadoEm: new Date()
  };
  reservas.push(reserva);
  res.status(201).json(reserva);
});

// Cancelar reserva
app.delete("/reservas/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = reservas.findIndex(r => r.id === id);

  if (index === -1) return res.status(404).json({ erro: "Reserva não encontrada." });

  reservas.splice(index, 1);
  res.json({ mensagem: "Reserva cancelada." });
});

app.listen(3000, () => console.log("Servidor rodando na porta 3000"));
