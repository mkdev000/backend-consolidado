const express = require("express");
const { nanoid } = require("nanoid");
const { poolRutlink } = require("../db");

const router = express.Router();

router.post("/api/enlaces", (req, res) => {
  const { urlOriginal } = req.body;

  if (!urlOriginal) {
    return res.status(400).json({ error: "Falta la URL original" });
  }

  const codigoCorto = nanoid(6);

  const consulta = "INSERT INTO urls (url_original, codigo_corto) VALUES (?, ?)";

  poolRutlink.query(consulta, [urlOriginal, codigoCorto], (error, resultado) => {
    if (error) {
      console.error("Error al guardar el enlace:", error);
      return res.status(500).json({ error: "Error al guardar el enlace" });
    }

    res.status(201).json({
      urlOriginal,
      codigoCorto,
      urlCorta: `https://backend-consolidado.onrender.com/${codigoCorto}`,
    });
  });
});

router.get("/api/enlaces", (req, res) => {
  const consulta = "SELECT * FROM urls ORDER BY fecha_creacion DESC LIMIT 3";

  poolRutlink.query(consulta, (error, resultados) => {
    if (error) {
      console.error("Error al listar los enlaces:", error);
      return res.status(500).json({ error: "Error al listar los enlaces" });
    }

    res.json(resultados);
  });
});

router.get("/:codigo", (req, res) => {
  const { codigo } = req.params;

  const consultaBuscar = "SELECT * FROM urls WHERE codigo_corto = ?";

  poolRutlink.query(consultaBuscar, [codigo], (error, resultados) => {
    if (error) {
      console.error("Error al buscar el enlace:", error);
      return res.status(500).json({ error: "Error al buscar el enlace" });
    }

    if (resultados.length === 0) {
      return res.status(404).json({ error: "Enlace no encontrado" });
    }

    const enlace = resultados[0];

    const consultaActualizar = "UPDATE urls SET clics = clics + 1 WHERE id = ?";
    poolRutlink.query(consultaActualizar, [enlace.id], (errorUpdate) => {
      if (errorUpdate) {
        console.error("Error al actualizar clics:", errorUpdate);
      }
    });

    res.redirect(enlace.url_original);
  });
});

module.exports = router;