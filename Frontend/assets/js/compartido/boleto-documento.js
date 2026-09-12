"use strict";

/*
 * BOLETOS Y COMPROBANTES IMPRIMIBLES
 * ----------------------------------
 * Dibuja el boleto como imagen PNG (canvas), arma el QR y genera las hojas
 * imprimibles de boleto y comprobante. Antes vivía dentro de sales-api.js,
 * donde mezclaba dibujo con llamadas de red y hacía el archivo difícil de leer.
 *
 * PARA QUIEN CONECTE DJANGO: en producción el comprobante y el boleto los
 * genera el servidor (rutas .../comprobante/descargar/ y .../descargar/).
 * Esto solo se usa en la vista local, con los datos de ventas-demo.js.
 *
 * Depende de assets/vendor/qrcode/qrcode.js, que la página debe cargar antes.
 */
(function crearBoletoDocumento(global) {
  const { ErrorDeApi } = global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  const RUTA_LOGO = "../../assets/images/AraMacao Completo Degradado (3).png";
  const ANCHO_IMAGEN = 1080;
  const ALTO_IMAGEN = 1900;

  /* El logo se descarga una sola vez por página y se reutiliza. */
  let logoPendiente = null;

  // -------------------------------------------------------------------
  // Entradas públicas
  // -------------------------------------------------------------------

  async function descargarBoletoPng(boletoId) {
    const { purchase: compra, ticket: boleto } = global.AramacaoVentasDemo.obtenerBoletoImprimible(boletoId);
    const [qrDataUrl, logoDataUrl] = await Promise.all([
      generarQrDataUrl(boleto.contenido_qr),
      obtenerLogoDataUrl(),
    ]);
    const imagen = await dibujarBoleto(compra, boleto, qrDataUrl, logoDataUrl);
    await entregarImagen(imagen, `boleto-${Util.nombreArchivoSeguro(boleto.numero)}.png`, boleto);
  }

  async function imprimirBoletoHtml(boletoId) {
    const { purchase: compra, ticket: boleto } = global.AramacaoVentasDemo.obtenerBoletoImprimible(boletoId);
    const [qrDataUrl, logoDataUrl] = await Promise.all([
      generarQrDataUrl(boleto.contenido_qr),
      obtenerLogoDataUrl(),
    ]);

    const promocion = boleto.promocion_2x1
      ? `<p><strong>Promoción 2x1:</strong> boleto ${boleto.posicion_2x1} de 2</p>`
      : "";

    const html = armarDocumentoImprimible(
      `Boleto ${boleto.asiento}`,
      `<main class="ticket">
        ${armarEncabezadoMarca(logoDataUrl)}
        <p class="document-kind">BOLETO DE ENTRADA</p>
        <p class="notice">Demostración local · sin validez comercial</p>
        <img class="qr" src="${qrDataUrl}" alt="Código QR del boleto ${Util.escaparHtml(boleto.asiento)}">
        <h2>${Util.escaparHtml(compra.pelicula)}</h2>
        <p class="ticket-seat">Asiento <strong>${Util.escaparHtml(boleto.asiento)}</strong></p>
        <p><strong>Comprador:</strong> ${Util.escaparHtml(compra.cliente_nombre)}</p>
        <p><strong>Función:</strong> ${Util.escaparHtml(compra.fecha_funcion)} · ${Util.escaparHtml(compra.hora_funcion)}</p>
        <p><strong>Formato:</strong> ${Util.escaparHtml(compra.formato)} · ${Util.escaparHtml(compra.sala)}</p>
        ${promocion}
        ${compra.canal === "TAQUILLA" ? `<p><strong>Venta:</strong> Taquilla</p>` : ""}
        <p><strong>Compra:</strong> ${Util.escaparHtml(compra.numero)}</p>
        <p><strong>Boleto:</strong> ${Util.escaparHtml(boleto.numero)}</p>
        <p class="foot">Cada QR admite un solo ingreso. No compartas esta imagen.</p>
      </main>`
    );
    descargarHtml(html, `boleto-${Util.nombreArchivoSeguro(boleto.numero)}.html`);
  }

  async function descargarComprobanteHtml(compraId) {
    const { compra } = global.AramacaoVentasDemo.obtenerCompra(compraId);
    const logoDataUrl = await obtenerLogoDataUrl();

    const filas = compra.boletos.map((boleto) => `
      <tr><td>${Util.escaparHtml(boleto.asiento)}</td><td>${Util.escaparHtml(boleto.formato)}</td><td>${boleto.promocion_2x1 ? `2x1 (${boleto.posicion_2x1}/2)` : "Normal"}</td></tr>
    `).join("");

    const esEfectivo = compra.metodo_pago === "EFECTIVO";
    const html = armarDocumentoImprimible(
      `Comprobante ${compra.numero}`,
      `<main>
        ${armarEncabezadoMarca(logoDataUrl)}
        <p class="document-kind">COMPROBANTE DE COMPRA</p>
        <p class="notice">No fiscal · demostración local</p>
        <p><strong>Comprobante:</strong> ${Util.escaparHtml(compra.comprobante?.numero || `COMP-${compra.numero}`)}</p>
        <p><strong>Referencia de venta:</strong> ${Util.escaparHtml(compra.numero)}</p>
        <p><strong>Fecha de venta:</strong> ${Util.escaparHtml(formatearFecha(compra.creada_en || compra.fecha))}</p>
        <p><strong>Estado:</strong> ${Util.escaparHtml(compra.estado || "PAGADA")}</p>
        <p><strong>Comprador:</strong> ${Util.escaparHtml(compra.cliente_nombre)}</p>
        <p><strong>Película:</strong> ${Util.escaparHtml(compra.pelicula)}</p>
        <p><strong>Función:</strong> ${Util.escaparHtml(compra.fecha_funcion)} · ${Util.escaparHtml(compra.hora_funcion)}</p>
        <p><strong>Sala:</strong> ${Util.escaparHtml(compra.sala)} · ${Util.escaparHtml(compra.formato)}</p>
        <p><strong>Canal:</strong> ${compra.canal === "TAQUILLA" ? "Taquilla" : "Compra en línea"}</p>
        <p><strong>Método de pago:</strong> ${Util.escaparHtml(compra.metodo_pago || "—")}</p>
        ${compra.vendedor_nombre ? `<p><strong>Vendedor:</strong> ${Util.escaparHtml(compra.vendedor_nombre)}</p>` : ""}
        <table><thead><tr><th>Asiento</th><th>Formato</th><th>Tarifa</th></tr></thead><tbody>${filas}</tbody></table>
        <p><strong>Subtotal:</strong> ${Util.formatearDinero(compra.subtotal)}</p>
        <p><strong>Descuento:</strong> −${Util.formatearDinero(compra.descuento)}</p>
        <p class="total"><strong>Total:</strong> ${Util.formatearDinero(compra.total)}</p>
        ${esEfectivo ? `<p><strong>Recibido:</strong> ${Util.formatearDinero(compra.efectivo_recibido)}</p><p><strong>Cambio:</strong> ${Util.formatearDinero(compra.cambio)}</p>` : ""}
        <p class="foot">Los boletos individuales y sus QR se descargan por separado.</p>
      </main>`
    );
    descargarHtml(html, `comprobante-${Util.nombreArchivoSeguro(compra.numero)}.html`);
  }

  async function generarQrDataUrl(contenido) {
    if (!global.QRCode?.toDataURL) {
      throw new ErrorDeApi("No fue posible cargar el generador QR.", 0, "QR_NO_DISPONIBLE");
    }
    return global.QRCode.toDataURL(contenido, {
      errorCorrectionLevel: "M",
      width: 220,
      margin: 2,
      color: { dark: "#050b16ff", light: "#ffffffff" },
    });
  }

  // -------------------------------------------------------------------
  // Logo de la marca
  // -------------------------------------------------------------------

  async function obtenerLogoDataUrl() {
    if (!logoPendiente) {
      logoPendiente = fetch(new URL(RUTA_LOGO, global.document.baseURI), { credentials: "same-origin" })
        .then((respuesta) => {
          if (!respuesta.ok) throw new Error("Logo no disponible");
          return respuesta.blob();
        })
        .then(blobADataUrl)
        /* Si el logo falla, el boleto se imprime con el nombre en texto. */
        .catch(() => "");
    }
    return logoPendiente;
  }

  function blobADataUrl(blob) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.addEventListener("load", () => resolver(String(lector.result || "")), { once: true });
      lector.addEventListener("error", () => rechazar(lector.error), { once: true });
      lector.readAsDataURL(blob);
    });
  }

  function armarEncabezadoMarca(logoDataUrl) {
    return logoDataUrl
      ? `<img class="brand-logo" src="${logoDataUrl}" alt="Aramacao Cinema">`
      : "<h1>Aramacao Cinema</h1>";
  }

  function formatearFecha(valor) {
    return Util.formatearFechaHora(valor, { alterno: "fecha desconocida" });
  }

  // -------------------------------------------------------------------
  // Hoja imprimible (boleto y comprobante comparten el mismo diseño)
  // -------------------------------------------------------------------

  /* Hoja de 58/80 mm con botones de tamano e impresion. El CSS se conserva
     exactamente como estaba: es el diseno del boleto impreso. */
  function armarDocumentoImprimible(titulo, cuerpo) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${Util.escaparHtml(titulo)}</title><style>
      :root{color-scheme:light;--content-width:52mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:#fff}body{font-family:Arial,sans-serif;font-size:11px;line-height:1.35}body[data-paper="80"]{--content-width:72mm}main{width:var(--content-width);max-width:100%;margin:0 auto;padding:2.5mm 2mm;background:#fff}.ticket{text-align:center}.brand-logo{display:block;width:38mm;max-width:90%;max-height:15mm;object-fit:contain;margin:0 auto 2mm;filter:contrast(1.08)}h1{margin:0 0 2mm;font-size:17px;line-height:1.1}h2{margin:2mm 0 1.5mm;font-size:14px;line-height:1.2}p{margin:1.2mm 0}.document-kind{margin:0 0 1.5mm;font-size:11px;font-weight:700;letter-spacing:.08em;text-align:center}.ticket-seat{margin:1.5mm 0;padding:1.5mm 1mm;border:1px solid #000;font-size:13px}.ticket-seat strong{font-size:18px}.qr{display:block;width:34mm;height:34mm;max-width:100%;margin:2mm auto;image-rendering:pixelated}.notice{margin:1.5mm 0 2mm;padding:1.5mm;border:1px dashed #000;background:#fff;font-size:10px;text-align:center}.foot{margin-top:2.5mm;padding-top:2mm;border-top:1px dashed #000;color:#222;font-size:9px}table{width:100%;border-collapse:collapse;margin:2mm 0;font-size:10px;table-layout:fixed}th,td{padding:1.3mm .6mm;border-bottom:1px solid #777;text-align:left;overflow-wrap:anywhere}.total{margin-top:2mm;padding-top:1.5mm;border-top:1px dashed #000;font-size:14px}.print-tools{display:none}@media screen{body{min-height:100vh;padding:64px 18px 18px;background:#dfe5ea}.print-tools{position:fixed;z-index:2;top:12px;left:50%;display:flex;gap:6px;align-items:center;transform:translateX(-50%);padding:6px;border-radius:10px;background:#050b16;box-shadow:0 2px 12px rgba(0,0,0,.25)}.print-tools button{min-height:34px;padding:7px 12px;border:1px solid #5a6a7a;border-radius:7px;color:#fff;background:#14283b;font:700 12px Arial,sans-serif;cursor:pointer}.print-tools button[aria-pressed="true"],.print-tools .print-primary{border-color:#ffd21c;color:#050b16;background:#ffd21c}main{box-shadow:0 2px 14px rgba(0,0,0,.18)}}@media print{@page{margin:2mm}html,body{width:100%;background:#fff}body{display:block;padding:0}main{width:var(--content-width);margin:0 auto;padding:0;box-shadow:none}.print-tools{display:none!important}}
    </style></head><body data-paper="58"><div class="print-tools" role="group" aria-label="Tamaño de papel"><button type="button" data-paper="58" aria-pressed="true">58 mm</button><button type="button" data-paper="80" aria-pressed="false">80 mm</button><button class="print-primary" type="button" data-print>Imprimir</button></div>${cuerpo}<script>(()=>{const buttons=[...document.querySelectorAll('[data-paper]')].filter((element)=>element.tagName==='BUTTON');buttons.forEach((button)=>button.addEventListener('click',()=>{document.body.dataset.paper=button.dataset.paper;buttons.forEach((item)=>item.setAttribute('aria-pressed',String(item===button)));}));document.querySelector('[data-print]')?.addEventListener('click',()=>window.print());})();</script></body></html>`;
  }

  // -------------------------------------------------------------------
  // Dibujo del boleto en PNG
  // -------------------------------------------------------------------

  async function dibujarBoleto(compra, boleto, qrDataUrl, logoDataUrl) {
    const lienzo = global.document.createElement("canvas");
    lienzo.width = ANCHO_IMAGEN;
    lienzo.height = ALTO_IMAGEN;

    const pincel = lienzo.getContext("2d");
    if (!pincel) {
      throw new ErrorDeApi("El navegador no pudo crear la imagen del boleto.", 0, "IMAGEN_NO_DISPONIBLE");
    }

    pincel.fillStyle = "#ffffff";
    pincel.fillRect(0, 0, lienzo.width, lienzo.height);
    pincel.textAlign = "center";
    pincel.textBaseline = "top";
    pincel.fillStyle = "#050b16";

    let y = 58;
    if (logoDataUrl) {
      const logo = await cargarImagen(logoDataUrl);
      dibujarImagenContenida(pincel, logo, 210, y, 660, 170);
      y += 190;
    } else {
      pincel.font = "700 58px Arial, sans-serif";
      pincel.fillText("Aramacao Cinema", lienzo.width / 2, y + 40);
      y += 150;
    }

    pincel.font = "700 34px Arial, sans-serif";
    pincel.fillText("BOLETO DE ENTRADA", lienzo.width / 2, y);
    y += 58;

    // Aviso de demostración, en un recuadro
    pincel.fillStyle = "#f4f6f8";
    pincel.fillRect(95, y, 890, 68);
    pincel.strokeStyle = "#050b16";
    pincel.lineWidth = 3;
    pincel.strokeRect(95, y, 890, 68);
    pincel.fillStyle = "#050b16";
    pincel.font = "26px Arial, sans-serif";
    pincel.fillText("Demostración local · sin validez comercial", lienzo.width / 2, y + 18);
    y += 100;

    // El QR se dibuja sin suavizado para que el escáner lo lea nítido
    const qr = await cargarImagen(qrDataUrl);
    pincel.imageSmoothingEnabled = false;
    pincel.fillStyle = "#ffffff";
    pincel.fillRect(240, y, 600, 600);
    pincel.drawImage(qr, 270, y + 30, 540, 540);
    pincel.imageSmoothingEnabled = true;
    y += 625;

    pincel.fillStyle = "#050b16";
    pincel.font = "700 48px Arial, sans-serif";
    y = dibujarTextoConSaltos(pincel, compra.pelicula, y, 900, 58) + 18;

    // Asiento destacado en amarillo de la marca
    pincel.fillStyle = "#ffd21c";
    pincel.fillRect(120, y, 840, 112);
    pincel.strokeStyle = "#050b16";
    pincel.strokeRect(120, y, 840, 112);
    pincel.fillStyle = "#050b16";
    pincel.font = "700 34px Arial, sans-serif";
    pincel.fillText("ASIENTO", lienzo.width / 2, y + 14);
    pincel.font = "700 54px Arial, sans-serif";
    pincel.fillText(String(boleto.asiento || "—"), lienzo.width / 2, y + 52);
    y += 138;

    const detalles = [
      `Comprador: ${compra.cliente_nombre || "Cliente"}`,
      `Función: ${compra.fecha_funcion || "—"} · ${compra.hora_funcion || "—"}`,
      `Formato: ${compra.formato || "—"} · ${compra.sala || "—"}`,
    ];
    if (boleto.promocion_2x1) detalles.push(`Promoción 2x1: boleto ${boleto.posicion_2x1} de 2`);
    if (compra.canal === "TAQUILLA") detalles.push("Venta: Taquilla");

    pincel.font = "30px Arial, sans-serif";
    pincel.fillStyle = "#050b16";
    detalles.forEach((detalle) => {
      y = dibujarTextoConSaltos(pincel, detalle, y, 920, 42) + 10;
    });

    // Línea de corte
    y += 8;
    pincel.setLineDash([12, 10]);
    pincel.beginPath();
    pincel.moveTo(90, y);
    pincel.lineTo(990, y);
    pincel.strokeStyle = "#050b16";
    pincel.lineWidth = 2;
    pincel.stroke();
    pincel.setLineDash([]);
    y += 30;

    pincel.font = "26px Arial, sans-serif";
    y = dibujarTextoConSaltos(pincel, `Compra: ${compra.numero}`, y, 900, 36) + 8;
    y = dibujarTextoConSaltos(pincel, `Boleto: ${boleto.numero}`, y, 900, 36) + 24;

    pincel.font = "24px Arial, sans-serif";
    pincel.fillStyle = "#2c3541";
    dibujarTextoConSaltos(
      pincel,
      "Cada QR admite un solo ingreso. Presenta esta imagen completa en Control de entrada.",
      y,
      860,
      34
    );

    return lienzoAPng(lienzo);
  }

  /* Reparte el texto en varias líneas para que no se salga del boleto. */
  function dibujarTextoConSaltos(pincel, valor, y, anchoMaximo, altoDeLinea) {
    const palabras = partirPalabrasLargas(pincel, String(valor || ""), anchoMaximo);
    const lineas = [];
    let linea = "";

    palabras.forEach((palabra) => {
      const candidata = linea ? `${linea} ${palabra}` : palabra;
      if (linea && pincel.measureText(candidata).width > anchoMaximo) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = candidata;
      }
    });
    if (linea) lineas.push(linea);

    lineas.forEach((texto, indice) => {
      pincel.fillText(texto, 540, y + (indice * altoDeLinea));
    });
    return y + (Math.max(lineas.length, 1) * altoDeLinea);
  }

  /* Una sola palabra más ancha que el boleto (un título sin espacios) se
     corta letra por letra en lugar de desbordarse. */
  function partirPalabrasLargas(pincel, valor, anchoMaximo) {
    return valor.split(/\s+/).filter(Boolean).flatMap((palabra) => {
      if (pincel.measureText(palabra).width <= anchoMaximo) return [palabra];

      const trozos = [];
      let trozo = "";
      [...palabra].forEach((letra) => {
        const candidato = `${trozo}${letra}`;
        if (trozo && pincel.measureText(candidato).width > anchoMaximo) {
          trozos.push(trozo);
          trozo = letra;
        } else {
          trozo = candidato;
        }
      });
      if (trozo) trozos.push(trozo);
      return trozos;
    });
  }

  /* Centra la imagen dentro del espacio dado sin deformarla. */
  function dibujarImagenContenida(pincel, imagen, x, y, ancho, alto) {
    const escala = Math.min(ancho / imagen.naturalWidth, alto / imagen.naturalHeight);
    const anchoFinal = imagen.naturalWidth * escala;
    const altoFinal = imagen.naturalHeight * escala;
    pincel.drawImage(
      imagen,
      x + ((ancho - anchoFinal) / 2),
      y + ((alto - altoFinal) / 2),
      anchoFinal,
      altoFinal
    );
  }

  function cargarImagen(origen) {
    return new Promise((resolver, rechazar) => {
      const imagen = new global.Image();
      imagen.onload = () => resolver(imagen);
      imagen.onerror = () => rechazar(
        new ErrorDeApi("No fue posible preparar la imagen del boleto.", 0, "IMAGEN_NO_DISPONIBLE")
      );
      imagen.src = origen;
    });
  }

  function lienzoAPng(lienzo) {
    return new Promise((resolver, rechazar) => {
      lienzo.toBlob((blob) => {
        if (blob) resolver(blob);
        else rechazar(
          new ErrorDeApi("No fue posible convertir el boleto en una imagen.", 0, "IMAGEN_NO_DISPONIBLE")
        );
      }, "image/png");
    });
  }

  // -------------------------------------------------------------------
  // Entrega del archivo al usuario
  // -------------------------------------------------------------------

  /* En teléfono se ofrece "compartir" (así se guarda en la galería);
     en computadora se descarga el archivo. */
  async function entregarImagen(blob, nombreArchivo, boleto) {
    const esPantallaTactil = global.matchMedia?.("(pointer: coarse)")?.matches;

    if (esPantallaTactil && global.File && global.navigator?.share && global.navigator?.canShare) {
      const archivo = new global.File([blob], nombreArchivo, { type: "image/png" });
      if (global.navigator.canShare({ files: [archivo] })) {
        try {
          await global.navigator.share({
            files: [archivo],
            title: `Boleto Aramacao Cinema · asiento ${boleto.asiento}`,
            text: "Guarda esta imagen para presentarla en Control de entrada.",
          });
          return;
        } catch (error) {
          /* El usuario canceló el diálogo de compartir: no se descarga nada. */
          if (error?.name === "AbortError") return;
        }
      }
    }
    descargarBlob(blob, nombreArchivo);
  }

  function descargarBlob(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const enlace = global.document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    global.document.body.append(enlace);
    enlace.click();
    enlace.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function descargarHtml(html, nombreArchivo) {
    descargarBlob(new Blob([html], { type: "text/html;charset=utf-8" }), nombreArchivo);
  }

  global.AramacaoBoletoDocumento = Object.freeze({
    descargarBoletoPng,
    imprimirBoletoHtml,
    descargarComprobanteHtml,
    generarQrDataUrl,
  });
})(window);
