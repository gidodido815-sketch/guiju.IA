require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const upload = multer({ dest: 'uploads/' });

// 1. RUTA DE PRUEBA
app.get('/', (req, res) => {
    res.json({ status: "online", message: "Servidor híbrido con imágenes listo." });
});

// 2. RUTA DE AUDIO (Mantiene Whisper + Llama 3)
app.post('/api/process-audio', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se recibió audio." });
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path), { filename: 'audio.wav', contentType: 'audio/wav' });
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'es');

        const transcriptionResponse = await axios.post('https://api.groq.com/v1/audio/transcriptions', formData, {
            headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${GROQ_API_KEY}` }
        });
        const textoTranscripto = transcriptionResponse.data.text;
        fs.unlinkSync(req.file.path);

        // Si el usuario pide una imagen hablando (ej: "Generá una foto de un gato")
        // Detectamos si la frase contiene palabras clave para desviarlo al motor de imágenes
        const fraseLower = textoTranscripto.toLowerCase();
        if (fraseLower.includes("generá una foto") || fraseLower.includes("creá una imagen") || fraseLower.includes("dibujá")) {
            const limpio = textoTranscripto.replace(/(generá una foto de|creá una imagen de|dibujá un|dibujá una)/gi, "").trim();
            const promptEncoded = encodeURIComponent(limpio);
            const imageUrl = `https://image.pollinations.ai/p/${promptEncoded}?width=1024&height=1024&nologo=true`;
            
            return res.json({ 
                transcription: textoTranscripto,
                result: `¡De una! Detecté que me lo pediste por voz. Acá tenés el dibujo de: "${limpio}".`,
                image: imageUrl
            });
        }

        const chatResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: "Sos un asistente experto, claro y conciso en español argentino. El usuario te habló por nota de voz." },
                { role: "user", content: textoTranscripto }
            ],
            temperature: 0.7
        }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });

        res.json({ transcription: textoTranscripto, result: chatResponse.data.choices[0].message.content });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: "Error en el pipeline de voz." });
    }
});

// 3. NUEVA RUTA: GENERACIÓN DE IMÁGENES POR TEXTO
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "El prompt es obligatorio" });

    try {
        console.log(`🎨 Generando imagen para: "${prompt}"...`);
        
        // Convertimos el texto a un formato seguro para URLs (ej: "gato negro" -> "gato%20negro")
        const promptEncoded = encodeURIComponent(prompt);
        
        // Usamos el motor ultra rápido en la nube de Pollinations (usa Flux/Stable Diffusion de fondo)
        const imageUrl = `https://image.pollinations.ai/p/${promptEncoded}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

        res.json({ success: true, image: imageUrl });
    } catch (error) {
        console.error("Error generando imagen:", error.message);
        res.status(500).json({ error: "No se pudo generar la imagen." });
    }
});

// 4. CHAT POR TEXTO TRADICIONAL
app.post('/api/chat', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Falta el prompt" });

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile", 
            messages: [
                { role: "system", content: "Sos un asistente experto en tecnología, claro y conciso en español argentino." },
                { role: "user", content: prompt }
            ],
            temperature: 0.7
        }, { headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' } });
        
        res.json({ result: response.data.choices[0].message.content });
    } catch (error) {
        res.status(500).json({ error: "Error de conexión." });
    }
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 Servidor Híbrido + VOZ + IMÁGENES en Puerto ${PORT}`);
    console.log(`==================================================`);
});