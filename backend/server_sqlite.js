// -------------------------
// IMPORTS
// -------------------------
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios'); // necessário para o WhatsApp
const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// -------------------------
// BANCO DE DADOS
// -------------------------
const DB = path.join(__dirname, 'sql', 'coelholog.db');
const db = new sqlite3.Database(DB);

// -------------------------
// CONFIG DO WHATSAPP - ZAPI
// -------------------------
const ZAPI_INSTANCE_ID = "3EA8C2DFDF843142F1BD324DD30A57B5";
const ZAPI_INSTANCE_TOKEN = "E27F2FADD7C07BF4B31E49A5";
const ZAPI_CLIENT_TOKEN = "F9b13f0dd488b44ea8a7dc25b9f2875a4S"; // token de segurança

// função de envio
async function enviarMensagemWhatsApp(telefone, mensagem) {
    try {
        const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`;

        const response = await axios.post(url, {
            phone: telefone.toString(),
            message: mensagem
        }, {
            headers: {
                "Client-Token": ZAPI_CLIENT_TOKEN
            }
        });

        console.log("Mensagem enviada:", response.data);
    } catch (error) {
        console.log("❌ Erro ao enviar mensagem:", error.response?.data || error.message);
    }
}

// -------------------------
// LOGIN
// -------------------------
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get(
        'SELECT id,nome,email,role FROM usuarios WHERE email=? AND senha=?',
        [email, password],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'db' });
            if (!row) return res.status(401).json({ error: 'invalid' });
            res.json(row);
        }
    );
});

// -------------------------
// USUÁRIOS
// -------------------------
app.get('/api/usuarios', (req, res) => {
    db.all(
        'SELECT id,nome,email,role,cnpj,telefone FROM usuarios ORDER BY id',
        [],
        (e, rows) => {
            if (e) return res.status(500).json({ error: 'db' });
            res.json(rows);
        }
    );
});

app.post('/api/usuarios', (req, res) => {
    const { nome, email, senha, role, cnpj, telefone } = req.body;

    db.get('SELECT id FROM usuarios WHERE email=?', [email], (err, row) => {
        if (row) return res.status(409).json({ error: 'exists' });

        db.run(
            'INSERT INTO usuarios(nome,email,senha,role,cnpj,telefone) VALUES (?,?,?,?,?,?)',
            [nome, email, senha, role || 'colaborador', cnpj || '', telefone || ''],
            function (err) {
                if (err) return res.status(500).json({ error: 'db' });

                db.get('SELECT id,nome,email,role FROM usuarios WHERE id=?',
                    [this.lastID],
                    (e, u) => res.json(u)
                );
            }
        );
    });
});

// -------------------------
// RECEBÍVEIS
// -------------------------
app.get('/api/recebiveis', (req, res) => {
    const userId = req.query.user_id;

    const sql = `
        SELECT r.id,r.usuario_id,u.nome,r.data,r.valor,r.tipo,r.status 
        FROM recebiveis r 
        LEFT JOIN usuarios u ON u.id=r.usuario_id
        ${userId ? 'WHERE r.usuario_id=?' : ''}
        ORDER BY r.id DESC
    `;

    db.all(sql, userId ? [userId] : [], (e, rows) => {
        if (e) return res.status(500).json({ error: 'db' });
        res.json(rows);
    });
});

app.post('/api/recebiveis', (req, res) => {
    const { usuario_id, data, valor, tipo, status } = req.body;

    db.run(
        'INSERT INTO recebiveis(usuario_id,data,valor,tipo,status) VALUES (?,?,?,?,?)',
        [usuario_id, data, valor, tipo, status || 'Pendente'],
        async function (err) {
            if (err) return res.status(500).json({ error: 'db' });

            // Enviar ao colaborador
            db.get('SELECT telefone FROM usuarios WHERE id=?', [usuario_id], (e, row) => {
                if (row?.telefone) {
                    enviarMensagemWhatsApp(
                        row.telefone,
                        `Você possui um novo recebível lançado no sistema.\nValor: R$ ${valor}`
                    );
                }
            });

            res.json({ id: this.lastID });
        }
    );
});

// atualizar recebível
app.put('/api/recebiveis/:id', (req, res) => {
    const id = req.params.id;
    const { data, valor, tipo, status } = req.body;

    db.run(
        'UPDATE recebiveis SET data=?,valor=?,tipo=?,status=? WHERE id=?',
        [data, valor, tipo, status, id],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' });

            // pegar telefone do colaborador
            db.get(
                'SELECT u.telefone FROM recebiveis r LEFT JOIN usuarios u ON u.id=r.usuario_id WHERE r.id=?',
                [id],
                (e, row) => {
                    if (row?.telefone) {
                        enviarMensagemWhatsApp(
                            row.telefone,
                            `Seu recebível foi atualizado para: ${status}`
                        );
                    }
                }
            );

            res.json({ ok: true });
        }
    );
});

// -------------------------
// EMPRÉSTIMOS
// -------------------------
app.get('/api/emprestimos', (req, res) => {
    const userId = req.query.user_id;

    const sql = `
        SELECT e.id,e.usuario_id,u.nome,e.valor,e.parcelamentos,e.status,e.criado_em 
        FROM emprestimos e 
        LEFT JOIN usuarios u ON u.id=e.usuario_id
        ${userId ? 'WHERE e.usuario_id=?' : ''}
        ORDER BY e.id DESC
    `;

    db.all(sql, userId ? [userId] : [], (e, rows) => {
        if (e) return res.status(500).json({ error: 'db' });
        res.json(rows);
    });
});

app.post('/api/emprestimos', (req, res) => {
    const { usuario_id, valor, parcelamentos } = req.body;

    db.get(
        'SELECT id FROM emprestimos WHERE usuario_id=? AND status IN ("Em análise","Aprovado")',
        [usuario_id],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'db' });
            if (row) return res.status(400).json({ error: 'Já existe um empréstimo ativo' });

            db.run(
                'INSERT INTO emprestimos(usuario_id,valor,parcelamentos,status,criado_em) VALUES (?,?,?,?,datetime("now"))',
                [usuario_id, valor, parcelamentos, 'Em análise'],
                async function (e) {
                    if (e) return res.status(500).json({ error: 'db' });

                    enviarMensagemWhatsApp("5511956914104", `Novo empréstimo solicitado pelo ID: ${usuario_id}`);

                    res.json({ id: this.lastID, status: 'Em análise' });
                }
            );
        }
    );
});

// atualizar empréstimo
app.put('/api/emprestimos/:id', (req, res) => {
    const id = req.params.id;
    const { status, valor, parcelamentos } = req.body;

    db.run(
        'UPDATE emprestimos SET status=?,valor=?,parcelamentos=? WHERE id=?',
        [status, valor, parcelamentos, id],
        function (err) {
            if (err) return res.status(500).json({ error: 'db' });

            db.get(
                'SELECT u.telefone FROM emprestimos e LEFT JOIN usuarios u ON u.id=e.usuario_id WHERE e.id=?',
                [id],
                (e, row) => {
                    if (row?.telefone) {
                        enviarMensagemWhatsApp(
                            row.telefone,
                            `Status do seu empréstimo foi atualizado para: ${status}`
                        );
                    }
                }
            );

            res.json({ ok: true });
        }
    );
});

// -------------------------
// INICIAR SERVIDOR
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running', PORT));
