const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AiService = require('../services/ai.service');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

const AuthController = {

    async register(req, res) {
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

            const perfilJson = perfil ? JSON.stringify(perfil) : null;
            let apellido = '';
            let ciudad = '';
            let objetivo = '';
            let ingresos = 0, gastos = 0, deudas = 0, emergencia = 0;
            
            if (perfil) {
                if (perfil.personal) {
                    apellido = perfil.personal.lastName || '';
                    ciudad = perfil.personal.city || '';
                }
                if (perfil.goals) {
                    objetivo = perfil.goals.mainGoal || '';
                }
                if (perfil.finances) {
                    ingresos = parseFloat(perfil.finances.monthlyIncome || perfil.finances.monthly_income_avg || 0);
                    gastos = parseFloat(perfil.finances.fixedExpenses || perfil.finances.fixed_expenses_monthly || 0);
                    deudas = parseFloat(perfil.finances.activeDebts || perfil.finances.current_debt_payment_monthly || 0);
                    emergencia = parseFloat(perfil.finances.emergencyFund || perfil.finances.emergency_fund_amount || 0);
                }
            }

            request.input('Nombre', sql.VarChar, nombre || 'Usuario');
            request.input('Apellido', sql.VarChar, apellido);
            request.input('Email', sql.VarChar, email);
            request.input('ContrasenaHash', sql.VarChar, hashedPassword);
            request.input('Ciudad', sql.VarChar, ciudad);
            request.input('ObjetivoPrincipalTexto', sql.VarChar, objetivo);
            request.input('Perfil', sql.NVarChar, perfilJson);

            const insertQuery = `
                INSERT INTO Usuarios (Nombre, Apellido, Email, ContrasenaHash, Ciudad, ObjetivoPrincipalTexto, Perfil, RolId, Activo, FechaCreacion, FechaActualizacion)
                OUTPUT INSERTED.Id, INSERTED.Nombre, INSERTED.Email, INSERTED.Perfil
                VALUES (@Nombre, @Apellido, @Email, @ContrasenaHash, @Ciudad, @ObjetivoPrincipalTexto, @Perfil, 1, 1, GETDATE(), GETDATE())
            `;

            const result = await request.query(insertQuery);
            const newUser = result.recordset[0];

            // 1. Guardar en tabla normalizada FinanzasUsuario
            if (perfil && perfil.finances) {
                const finanzasReq = new sql.Request();
                finanzasReq.input('UserId', sql.Int, newUser.Id);
                finanzasReq.input('Ingresos', sql.Decimal(18,2), ingresos);
                finanzasReq.input('Gastos', sql.Decimal(18,2), gastos);
                finanzasReq.input('Deudas', sql.Decimal(18,2), deudas);
                finanzasReq.input('Emergencia', sql.Decimal(18,2), emergencia);
                await finanzasReq.query(`
                    INSERT INTO FinanzasUsuario (UsuarioId, IngresoMensual, GastosFijos, DeudasActivas, FondoEmergencia)
                    VALUES (@UserId, @Ingresos, @Gastos, @Deudas, @Emergencia)
                `);
            }

            // 2. Clasificar segmento
            let segmento = null;
            if (perfil) {
                segmento = await AiService.clasificarYGuardarSegmento(newUser.Id, perfil);
            }

            // Generar JWT
            const token = jwt.sign({ id: newUser.Id, email: newUser.Email }, JWT_SECRET, { expiresIn: '24h' });

            res.status(201).json({
                mensaje: 'Usuario registrado exitosamente',
                token,
                usuario: {
                    id: newUser.Id,
                    nombre: newUser.Nombre,
                    email: newUser.Email,
                    perfil: newUser.Perfil ? JSON.parse(newUser.Perfil) : null,
                    segmento
                }
            });

        } catch (error) {
            console.error('Error en register:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    async login(req, res) {
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
            const isMatch = await bcrypt.compare(password, usuario.ContrasenaHash);

            if (!isMatch) {
                return res.status(401).json({ error: 'Email o contraseña incorrectos' });
            }

            const token = jwt.sign({ id: usuario.Id, email: usuario.Email }, JWT_SECRET, { expiresIn: '24h' });

            res.json({
                mensaje: 'Login exitoso',
                token,
                usuario: {
                    id: usuario.Id,
                    nombre: usuario.Nombre,
                    email: usuario.Email,
                    perfil: usuario.Perfil ? JSON.parse(usuario.Perfil) : null
                }
            });

        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    async updateProfile(req, res) {
        try {
            const userId = req.params.id;
            const { perfil } = req.body; 
            
            if (req.user && req.user.id !== parseInt(userId)) {
                return res.status(403).json({ error: 'No tienes permiso para modificar este perfil' });
            }

            if (!perfil) {
                return res.status(400).json({ error: 'Los datos del perfil son requeridos' });
            }

            const perfilJson = JSON.stringify(perfil);
            const request = new sql.Request();
            request.input('Id', sql.Int, userId);
            request.input('Perfil', sql.NVarChar, perfilJson);

            const result = await request.query(`
                UPDATE Usuarios SET Perfil = @Perfil WHERE Id = @Id
            `);

            if (result.rowsAffected[0] === 0) {
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            // Actualizar tabla relacional
            if (perfil.finances) {
                const ingresos = parseFloat(perfil.finances.monthlyIncome || perfil.finances.monthly_income_avg || 0);
                const gastos = parseFloat(perfil.finances.fixedExpenses || perfil.finances.fixed_expenses_monthly || 0);
                const deudas = parseFloat(perfil.finances.activeDebts || perfil.finances.current_debt_payment_monthly || 0);
                const emergencia = parseFloat(perfil.finances.emergencyFund || perfil.finances.emergency_fund_amount || 0);

                const finanzasReq = new sql.Request();
                finanzasReq.input('UserId', sql.Int, userId);
                finanzasReq.input('Ingresos', sql.Decimal(18,2), ingresos);
                finanzasReq.input('Gastos', sql.Decimal(18,2), gastos);
                finanzasReq.input('Deudas', sql.Decimal(18,2), deudas);
                finanzasReq.input('Emergencia', sql.Decimal(18,2), emergencia);
                
                await finanzasReq.query(`
                    IF EXISTS (SELECT 1 FROM FinanzasUsuario WHERE UsuarioId = @UserId)
                        UPDATE FinanzasUsuario 
                        SET IngresoMensual=@Ingresos, GastosFijos=@Gastos, DeudasActivas=@Deudas, FondoEmergencia=@Emergencia, FechaActualizacion=GETDATE()
                        WHERE UsuarioId = @UserId
                    ELSE
                        INSERT INTO FinanzasUsuario (UsuarioId, IngresoMensual, GastosFijos, DeudasActivas, FondoEmergencia)
                        VALUES (@UserId, @Ingresos, @Gastos, @Deudas, @Emergencia)
                `);
            }

            const segmento = await AiService.clasificarYGuardarSegmento(parseInt(userId), perfil);
            res.json({ mensaje: 'Perfil actualizado exitosamente', segmento });

        } catch (error) {
            console.error('Error en actualizar perfil:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
};

module.exports = AuthController;
