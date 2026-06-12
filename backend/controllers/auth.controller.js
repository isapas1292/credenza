const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AiService = require('../services/ai.service');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const isNonNegativeNumber = (value) => value !== null
    && value !== ''
    && Number.isFinite(Number(value))
    && Number(value) >= 0;

function validateProfile(perfil) {
    const personal = perfil?.personal;
    const finances = perfil?.finances;
    const goals = perfil?.goals;
    const preferences = perfil?.preferences;
    const investments = perfil?.investments;

    if (!personal || !finances || !goals || !preferences || !investments) {
        return 'El perfil financiero está incompleto';
    }
    if (!hasText(personal.firstName) || !hasText(personal.lastName) || !hasText(personal.city)
        || !hasText(personal.maritalStatus) || !hasText(personal.employmentType)) {
        return 'Completa todos los datos personales obligatorios';
    }
    if (!Number.isFinite(Number(personal.age)) || Number(personal.age) <= 0
        || !isNonNegativeNumber(personal.dependents)) {
        return 'La edad debe ser mayor que 0 y los dependientes deben ser 0 o más';
    }
    const financialFields = [
        finances.monthlyIncome, finances.extraIncome, finances.fixedExpenses,
        finances.variableExpenses, finances.activeDebts, finances.monthlySavingsCapacity,
        finances.emergencyFundMonths, finances.liquidSavings, investments.currentCapital,
    ];
    if (financialFields.some((value) => !isNonNegativeNumber(value))) {
        return 'Completa todos los valores financieros con 0 o un número mayor';
    }
    if (!hasText(goals.mainGoal) || !hasText(goals.timeHorizon)
        || !hasText(preferences.riskTolerance) || !hasText(preferences.bigPurchaseHabit)
        || !hasText(preferences.expenseTracking) || !hasText(investments.hasExperience)) {
        return 'Completa los objetivos, preferencias y experiencia de inversión';
    }
    return null;
}

const AuthController = {

    async register(req, res) {
        let transaction = null;
        try {
            const { nombre, email, password, perfil } = req.body;

            if (!hasText(nombre) || !hasText(email) || !hasText(password) || !perfil) {
                return res.status(400).json({ error: 'Email, contraseña y perfil financiero son obligatorios' });
            }

            // Verificar si el correo ya existe (parametrizado: evita inyección SQL)
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
            }
            if (password.length < 8) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
            }
            const profileError = validateProfile(perfil);
            if (profileError) {
                return res.status(400).json({ error: profileError });
            }

            const checkReq = new sql.Request();
            checkReq.input('Email', sql.VarChar, email);
            const checkResult = await checkReq.query('SELECT Id FROM Usuarios WHERE Email = @Email');
            if (checkResult.recordset.length > 0) {
                return res.status(400).json({ error: 'El email ya está registrado' });
            }

            // Clasificar antes de abrir la transacción: si Python falla, no se
            // crea un usuario incompleto ni queda un segmento ausente.
            const segmento = await AiService.clasificarPerfil(perfil);

            // Encriptar la contraseña
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const perfilJson = perfil ? JSON.stringify(perfil) : null;
            let apellido = '';
            let ciudad = '';
            if (perfil && perfil.personal) {
                apellido = perfil.personal.lastName || '';
                ciudad = perfil.personal.city || '';
            }

            transaction = new sql.Transaction();
            await transaction.begin();
            const request = new sql.Request(transaction);
            request.input('Nombre', sql.VarChar, nombre || 'Usuario');
            request.input('Apellido', sql.VarChar, apellido);
            request.input('Email', sql.VarChar, email);
            request.input('ContrasenaHash', sql.VarChar, hashedPassword);
            request.input('Ciudad', sql.VarChar, ciudad);
            request.input('Perfil', sql.NVarChar, perfilJson);

            const insertQuery = `
                INSERT INTO Usuarios (Nombre, Apellido, Email, ContrasenaHash, Ciudad, Perfil, RolId, Activo, FechaCreacion, FechaActualizacion)
                OUTPUT INSERTED.Id, INSERTED.Nombre, INSERTED.Email, INSERTED.Perfil
                VALUES (@Nombre, @Apellido, @Email, @ContrasenaHash, @Ciudad, @Perfil, 1, 1, GETDATE(), GETDATE())
            `;

            const result = await request.query(insertQuery);
            const newUser = result.recordset[0];

            await AiService.guardarSegmento(newUser.Id, segmento, transaction);
            await transaction.commit();
            transaction = null;

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
            if (transaction) {
                try { await transaction.rollback(); } catch (_) {}
            }
            console.error('Error en register:', error);
            res.status(500).json({ error: 'No fue posible registrar el usuario y su segmento financiero' });
        }
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!hasText(email) || !hasText(password)) {
                return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
            }

            const request = new sql.Request();
            request.input('Email', sql.VarChar, email);

            const result = await request.query(`
                SELECT u.*, s.SegmentId, s.SegmentName, s.ProfileScore, s.Summary AS SegmentSummary
                FROM Usuarios u
                LEFT JOIN SegmentosFinancierosUsuario s ON s.UsuarioId = u.Id
                WHERE u.Email = @Email
            `);

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
                    perfil: usuario.Perfil ? JSON.parse(usuario.Perfil) : null,
                    segmento: usuario.SegmentId ? {
                        segment_id: usuario.SegmentId,
                        segment_name: usuario.SegmentName,
                        profile_score: usuario.ProfileScore,
                        summary: usuario.SegmentSummary
                    } : null
                }
            });

        } catch (error) {
            console.error('Error en login:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    async updateProfile(req, res) {
        let transaction = null;
        try {
            const userId = req.params.id;
            const { perfil } = req.body; 
            
            if (req.user && req.user.id !== parseInt(userId)) {
                return res.status(403).json({ error: 'No tienes permiso para modificar este perfil' });
            }

            if (!perfil) {
                return res.status(400).json({ error: 'Los datos del perfil son requeridos' });
            }

            const profileError = validateProfile(perfil);
            if (profileError) {
                return res.status(400).json({ error: profileError });
            }

            // Recalcular primero. Perfil y segmento se guardan juntos o ninguno
            // cambia, evitando que la tabla quede desactualizada.
            const segmento = await AiService.clasificarPerfil(perfil);
            const perfilJson = JSON.stringify(perfil);
            transaction = new sql.Transaction();
            await transaction.begin();
            const request = new sql.Request(transaction);
            request.input('Id', sql.Int, userId);
            request.input('Perfil', sql.NVarChar, perfilJson);

            const result = await request.query(`
                UPDATE Usuarios SET Perfil = @Perfil, FechaActualizacion = GETDATE() WHERE Id = @Id
            `);

            if (result.rowsAffected[0] === 0) {
                await transaction.rollback();
                transaction = null;
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            await AiService.guardarSegmento(parseInt(userId), segmento, transaction);
            await transaction.commit();
            transaction = null;
            res.json({ mensaje: 'Perfil actualizado exitosamente', segmento });

        } catch (error) {
            if (transaction) {
                try { await transaction.rollback(); } catch (_) {}
            }
            console.error('Error en actualizar perfil:', error);
            res.status(500).json({ error: 'No fue posible actualizar el perfil y su segmento financiero' });
        }
    }
};

module.exports = AuthController;
