// CADASTRO DE USUARIOS //

const express = require("express");
const app = express();

app.use(express.json());

// usuários cadastrados no sistema //
let usuarios = [
  
  {
    id: 1,
    nome: "Richard Teixeira",
    email: "richard@gmail.com",
    telefone: "11987563468",
    criadoEm: new Date()
  },
  {
    id: 2,
    nome: "Noemy portapilla",
    email: "noemy@gmail.com",
    telefone: "11934567896",
    criadoEm: new Date()
  },
  {
    id: 3,
    nome: "Anthony Ferreira Rosembauer",
    email: "anthonyferreira@gmail.com",
    telefone: "11994207516",
    criadoEm: new Date()
  },
  {
    id: 4,
    nome: "Leandro Pereira",
    email: "leandro@gmail.com",
    telefone: "11987654321",
    criadoEm: new Date()
  },

  {
    id: 5,
    nome: "Guilherme Galdino",
    email: "guilherme@gmail.com",
    telefone: "11934209876",
    criadoEm: new Date()
}
];

let id = 1;

//rota onde o usuario vai ser cadastrado//
app.post('/usuarios', (req, res) => {
 
  const { nome, email, telefone } = req.body;

  const user = {
    id: id++,
    nome: nome,
    email: email,
    telefone: telefone,
    criadoEm: new Date()
  };

  // Adiciona o usuário ao array de usuários //
  usuarios.push(user);
  
  res.status(200).send(user);

});

//rota onde o usuario vai ser listado//
app.get('/buscar/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);

  const user = usuarios.find(usuario => usuario.id === id);

  if (!user) {
    return res.status(404).send({ message: "Usuário não encontrado" });
  }

  return res.status(200).send(user);
});

// Deletar usuário
app.delete("/usuarios/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = usuarios.findIndex(u => u.id === id);

  if (user === -1) return res.status(404).json({ erro: "Usuário não encontrado." });

  usuarios.splice(user, 1);
  res.json({ mensagem: "Usuário removido." });
});


app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});