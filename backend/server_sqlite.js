const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname,'../public')));

const DB = path.join(__dirname,'sql','coelholog.db');
const db = new sqlite3.Database(DB);

// login
app.post('/api/login',(req,res)=>{
  const {email,password} = req.body;
  db.get('SELECT id,nome,email,role FROM usuarios WHERE email=? AND senha=?',[email,password],(err,row)=>{
    if(err) return res.status(500).json({error:'db'});
    if(!row) return res.status(401).json({error:'invalid'});
    res.json(row);
  });
});

// usuarios
app.get('/api/usuarios',(req,res)=>{
  db.all('SELECT id,nome,email,role,cnpj,telefone FROM usuarios ORDER BY id',[],(e,rows)=>{ if(e) return res.status(500).json({error:'db'}); res.json(rows); });
});
app.post('/api/usuarios',(req,res)=>{
  const {nome,email,senha,role,cnpj,telefone} = req.body;
  db.get('SELECT id FROM usuarios WHERE email=?',[email],(err,row)=>{
    if(row) return res.status(409).json({error:'exists'});
    db.run('INSERT INTO usuarios(nome,email,senha,role,cnpj,telefone) VALUES (?,?,?,?,?,?)',[nome,email,senha,role||'colaborador',cnpj||'',telefone||''], function(err){
      if(err) return res.status(500).json({error:'db'});
      db.get('SELECT id,nome,email,role FROM usuarios WHERE id=?',[this.lastID], (e,u)=> res.json(u));
    });
  });
});

// recebiveis
app.get('/api/recebiveis',(req,res)=>{
  const userId = req.query.user_id;
  if(userId){
    db.all('SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status FROM recebiveis r LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE r.usuario_id=? ORDER BY r.id DESC',[userId], (e,rows)=>{ if(e) return res.status(500).json({error:'db'}); res.json(rows); });
    return;
  }
  db.all('SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status FROM recebiveis r LEFT JOIN usuarios u ON u.id=r.usuario_id ORDER BY r.id DESC',[],(e,rows)=>{ if(e) return res.status(500).json({error:'db'}); res.json(rows); });
});
app.post('/api/recebiveis',(req,res)=>{
  const {usuario_id,data,valor,tipo,status} = req.body;
  db.run('INSERT INTO recebiveis(usuario_id,data,valor,tipo,status) VALUES (?,?,?,?,?)',[usuario_id,data,valor,tipo,status||'Pendente'], function(err){
    if(err) return res.status(500).json({error:'db'});
    res.json({id:this.lastID});
  });
});
app.put('/api/recebiveis/:id',(req,res)=>{
  const id=req.params.id;
  const {data,valor,tipo,status} = req.body;
  db.run('UPDATE recebiveis SET data=?,valor=?,tipo=?,status=? WHERE id=?',[data,valor,tipo,status,id], function(err){ if(err) return res.status(500).json({error:'db'}); res.json({ok:true}); });
});

// emprestimos
app.get('/api/emprestimos',(req,res)=>{
  const userId = req.query.user_id;
  if(userId){
    db.all('SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em FROM emprestimos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.usuario_id=? ORDER BY e.id DESC',[userId],(e,rows)=>{ if(e) return res.status(500).json({error:'db'}); res.json(rows); });
    return;
  }
  db.all('SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em FROM emprestimos e LEFT JOIN usuarios u ON u.id=e.usuario_id ORDER BY e.id DESC',[],(e,rows)=>{ if(e) return res.status(500).json({error:'db'}); res.json(rows); });
});
app.post('/api/emprestimos',(req,res)=>{
  const {usuario_id,valor,parcelamentos} = req.body;
  db.get('SELECT id FROM emprestimos WHERE usuario_id=? AND status IN ("Em análise","Aprovado")',[usuario_id],(err,row)=>{
    if(err) return res.status(500).json({error:'db'});
    if(row) return res.status(400).json({error:'Já existe um empréstimo ativo'});
    db.run('INSERT INTO emprestimos(usuario_id,valor,parcelamentos,status,criado_em) VALUES (?,?,?,?,datetime("now"))',[usuario_id,valor,parcelamentos,'Em análise'], function(e){ if(e) return res.status(500).json({error:'db'}); res.json({id:this.lastID, status:'Em análise'}); });
  });
});
app.put('/api/emprestimos/:id',(req,res)=>{
  const id=req.params.id; const {status,valor,parcelamentos} = req.body;
  db.run('UPDATE emprestimos SET status=?,valor=?,parcelamentos=? WHERE id=?',[status,valor,parcelamentos,id], function(err){ if(err) return res.status(500).json({error:'db'}); res.json({ok:true}); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running', PORT));
