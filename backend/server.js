const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configuración de la base de datos
const dbConfig = {
    user: 'jami_user', // Usuario por defecto de los proyectos anteriores, ajústalo si es diferente
    password: '6013', // Contraseña de los proyectos anteriores
    server: 'localhost',
    database: 'Credenza',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Conectar a la base de datos e inicializar tablas
async function initDb() {
    try {
        await sql.connect(dbConfig);
        console.log('Conectado a la base de datos SQL Server (Credenza)');

        // La creación se omite o se ajusta porque la tabla ya existe con otro esquema.
        // Asumimos que la tabla ya tiene Id, Nombre, Apellido, Email, ContrasenaHash, Ciudad, ObjetivoPrincipalTexto, Perfil, etc.
        console.log('Verificación de BD completa.');
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error.message);
        // Si el error es que la base de datos no existe, podríamos intentar crearla (requiere master)
        // Por ahora, asumimos que "Credenza" ya está creada en el motor.
    }
}
initDb();

// Endpoint de Registro
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nombre, email, password, perfil } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
        }

        const request = new sql.Request();
        
        // Verificar si el correo ya existe
        const checkResult = await request.query(`SELECT Id FROM Usuarios WHERE Email = '${email}'`);
        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ error: 'El email ya está registrado' });
        }

        // Encriptar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Convertir el objeto perfil a string JSON si existe, si no, guardarlo como NULL
        const perfilJson = perfil ? JSON.stringify(perfil) : null;

        // Insertar en la base de datos
        // Extraer apellido, ciudad y objetivo si vienen en el perfil
        let apellido = '';
        let ciudad = '';
        let objetivo = '';
        if (perfil && perfil.personal) {
            apellido = perfil.personal.lastName || '';
            ciudad = perfil.personal.city || '';
        }
        if (perfil && perfil.goals) {
            objetivo = perfil.goals.mainGoal || '';
        }

        request.input('Nombre', sql.VarChar, nombre || 'Usuario');
        request.input('Apellido', sql.VarChar, apellido);
        request.input('Email', sql.VarChar, email);
        request.input('ContrasenaHash', sql.VarChar, hashedPassword);
        request.input('Ciudad', sql.VarChar, ciudad);
        request.input('ObjetivoPrincipalTexto', sql.VarChar, objetivo);
        request.input('Perfil', sql.NVarChar, perfilJson);
        // RolId y Activo tienen defaults o pueden ser NULL, FechaCreacion también.

        const insertQuery = `
            INSERT INTO Usuarios (Nombre, Apellido, Email, ContrasenaHash, Ciudad, ObjetivoPrincipalTexto, Perfil, RolId, Activo, FechaCreacion, FechaActualizacion)
            OUTPUT INSERTED.Id, INSERTED.Nombre, INSERTED.Email, INSERTED.Perfil
            VALUES (@Nombre, @Apellido, @Email, @ContrasenaHash, @Ciudad, @ObjetivoPrincipalTexto, @Perfil, 1, 1, GETDATE(), GETDATE())
        `;

        const result = await request.query(insertQuery);
        const newUser = result.recordset[0];

        res.status(201).json({
            mensaje: 'Usuario registrado exitosamente',
            usuario: {
                id: newUser.Id,
                nombre: newUser.Nombre,
                email: newUser.Email,
                perfil: newUser.Perfil ? JSON.parse(newUser.Perfil) : null
            }
        });

    } catch (error) {
        console.error('Error en /api/auth/register:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint de Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
        }

        const request = new sql.Request();
        request.input('Email', sql.VarChar, email);

        const result = await request.query(`SELECT * FROM Usuarios WHERE Email = @Email`);
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }

        const usuario = result.recordset[0];

        // Verificar la contraseña con bcrypt
        const isMatch = await bcrypt.compare(password, usuario.ContrasenaHash);
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Email o contraseña incorrectos' });
        }

        res.json({
            mensaje: 'Login exitoso',
            usuario: {
                id: usuario.Id,
                nombre: usuario.Nombre,
                email: usuario.Email,
                perfil: usuario.Perfil ? JSON.parse(usuario.Perfil) : null
            }
        });

    } catch (error) {
        console.error('Error en /api/auth/login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Endpoint para actualizar el perfil del usuario (después del registro si lo hacen en pasos separados)
app.put('/api/usuarios/:id/perfil', async (req, res) => {
    try {
        const userId = req.params.id;
        const { perfil } = req.body; // El objeto JSON con todos los datos

        if (!perfil) {
            return res.status(400).json({ error: 'Los datos del perfil son requeridos' });
        }

        const perfilJson = JSON.stringify(perfil);

        const request = new sql.Request();
        request.input('Id', sql.Int, userId);
        request.input('Perfil', sql.NVarChar, perfilJson);

        const result = await request.query(`
            UPDATE Usuarios 
            SET Perfil = @Perfil 
            WHERE Id = @Id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ mensaje: 'Perfil actualizado exitosamente' });

    } catch (error) {
        console.error('Error en actualizar perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
