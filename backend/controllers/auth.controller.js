const { pool } = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const AiService = require('../services/ai.service');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const isNonNegativeNumber = (value) => value !== null
    && value !== ''
    && Number.isFinite(Number(value))
    && Number(value) >= 0;

// Validación de contraseña FUERTE (servidor = fuente de verdad).
// Requiere: 8+ caracteres, mayúscula, minúscula, número, símbolo y sin espacios.
function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8) {
        return 'La contraseña debe tener al menos 8 caracteres';
    }
    if (password.length > 64) {
        return 'La contraseña es demasiado larga (máximo 64 caracteres)';
    }
    if (/\s/.test(password)) {
        return 'La contraseña no debe contener espacios';
    }
    if (!/[A-Z]/.test(password)) {
        return 'La contraseña debe incluir al menos una letra mayúscula';
    }
    if (!/[a-z]/.test(password)) {
        return 'La contraseña debe incluir al menos una letra minúscula';
    }
    if (!/[0-9]/.test(password)) {
        return 'La contraseña debe incluir al menos un número';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return 'La contraseña debe incluir al menos un símbolo especial (ej. ! @ # $ %)';
    }
    return null;
}

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
        let client = null;
        try {
            const { nombre, email, password, perfil } = req.body;

            if (!hasText(nombre) || !hasText(email) || !hasText(password) || !perfil) {
                return res.status(400).json({ error: 'Email, contraseña y perfil financiero son obligatorios' });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                return res.status(400).json({ error: 'Ingresa un correo electrónico válido' });
            }
            const passwordError = validatePassword(password);
            if (passwordError) {
                return res.status(400).json({ error: passwordError });
            }
            const profileError = validateProfile(perfil);
            if (profileError) {
                return res.status(400).json({ error: profileError });
            }

            // Verificar si el correo ya existe (parametrizado)
            const checkResult = await pool.query('SELECT "Id" FROM "Usuarios" WHERE "Email" = $1', [email]);
            if (checkResult.rows.length > 0) {
                return res.status(400).json({ error: 'El email ya está registrado' });
            }

            // Clasificar antes de abrir la transacción: si Python falla, no se
            // crea un usuario incompleto ni queda un segmento ausente.
            const segmento = await AiService.clasificarPerfil(perfil);

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            const apellido = perfil?.personal?.lastName || '';
            const ciudad = perfil?.personal?.city || '';

            client = await pool.connect();
            await client.query('BEGIN');

            const insertResult = await client.query(`
                INSERT INTO "Usuarios"
                    ("Nombre", "Apellido", "Email", "ContrasenaHash", "Ciudad", "Perfil", "RolId", "Activo", "FechaCreacion", "FechaActualizacion")
                VALUES ($1, $2, $3, $4, $5, $6, 1, true, now(), now())
                RETURNING "Id", "Nombre", "Email", "Perfil"
            `, [nombre || 'Usuario', apellido, email, hashedPassword, ciudad, perfil]);

            const newUser = insertResult.rows[0];

            await AiService.guardarSegmento(newUser.Id, segmento, client);
            await client.query('COMMIT');
            client.release();
            client = null;

            const token = jwt.sign({ id: Number(newUser.Id), email: newUser.Email }, JWT_SECRET, { expiresIn: '24h' });

            res.status(201).json({
                mensaje: 'Usuario registrado exitosamente',
                token,
                usuario: {
                    id: Number(newUser.Id),
                    nombre: newUser.Nombre,
                    email: newUser.Email,
                    perfil: newUser.Perfil || null,   // jsonb → ya es objeto
                    segmento
                }
            });

        } catch (error) {
            if (client) {
                try { await client.query('ROLLBACK'); } catch (_) {}
                client.release();
            }
            console.error('Error en register:', error.message);
            res.status(500).json({ error: 'No fue posible registrar el usuario y su segmento financiero' });
        }
    },

    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!hasText(email) || !hasText(password)) {
                return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
            }

            const result = await pool.query(`
                SELECT u.*,
                       s."SegmentId", s."SegmentName", s."ProfileScore", s."Summary" AS "SegmentSummary"
                FROM "Usuarios" u
                LEFT JOIN "SegmentosFinancierosUsuario" s ON s."UsuarioId" = u."Id"
                WHERE u."Email" = $1
            `, [email]);

            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Email o contraseña incorrectos' });
            }

            const usuario = result.rows[0];
            const isMatch = await bcrypt.compare(password, usuario.ContrasenaHash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Email o contraseña incorrectos' });
            }

            const token = jwt.sign({ id: Number(usuario.Id), email: usuario.Email }, JWT_SECRET, { expiresIn: '24h' });

            res.json({
                mensaje: 'Login exitoso',
                token,
                usuario: {
                    id: Number(usuario.Id),
                    nombre: usuario.Nombre,
                    email: usuario.Email,
                    perfil: usuario.Perfil || null,   // jsonb → objeto
                    segmento: usuario.SegmentId ? {
                        segment_id: usuario.SegmentId,
                        segment_name: usuario.SegmentName,
                        profile_score: usuario.ProfileScore,
                        summary: usuario.SegmentSummary
                    } : null
                }
            });

        } catch (error) {
            console.error('Error en login:', error.message);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    },

    async updateProfile(req, res) {
        let client = null;
        try {
            const userId = parseInt(req.params.id, 10);
            const { perfil } = req.body;

            if (req.user && req.user.id !== userId) {
                return res.status(403).json({ error: 'No tienes permiso para modificar este perfil' });
            }
            if (!perfil) {
                return res.status(400).json({ error: 'Los datos del perfil son requeridos' });
            }
            const profileError = validateProfile(perfil);
            if (profileError) {
                return res.status(400).json({ error: profileError });
            }

            // Recalcular primero. Perfil y segmento se guardan juntos o ninguno cambia.
            const segmento = await AiService.clasificarPerfil(perfil);

            client = await pool.connect();
            await client.query('BEGIN');

            const result = await client.query(
                'UPDATE "Usuarios" SET "Perfil" = $1, "FechaActualizacion" = now() WHERE "Id" = $2',
                [perfil, userId]
            );

            if (result.rowCount === 0) {
                await client.query('ROLLBACK');
                client.release();
                client = null;
                return res.status(404).json({ error: 'Usuario no encontrado' });
            }

            await AiService.guardarSegmento(userId, segmento, client);
            await client.query('COMMIT');
            client.release();
            client = null;

            res.json({ mensaje: 'Perfil actualizado exitosamente', segmento });

        } catch (error) {
            if (client) {
                try { await client.query('ROLLBACK'); } catch (_) {}
                client.release();
            }
            console.error('Error en actualizar perfil:', error.message);
            res.status(500).json({ error: 'No fue posible actualizar el perfil y su segmento financiero' });
        }
    }
};

module.exports = AuthController;
