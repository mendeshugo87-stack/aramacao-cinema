"use strict";

/*
 * ALMACÉN DE VENTAS DE DEMOSTRACIÓN (SOLO LOCALHOST)
 * --------------------------------------------------
 * Guarda compras, boletos y QR de prueba en localStorage para poder revisar
 * el circuito completo sin backend: Compra → Mi cuenta → Taquilla → Entrada.
 *
 * PARA QUIEN CONECTE DJANGO: este archivo se puede borrar entero el día que el
 * backend responda. Nada de aquí se usa en producción; compartido/sales-api.js
 * solo lo llama cuando AramacaoUtil.esVistaLocal() es verdadero.
 *
 * Los nombres de los campos (compra, boletos, estado, promocion_2x1…) imitan
 * a propósito el contrato documentado en docs/API_*.md, para que al conectar
 * el backend las pantallas no tengan que cambiar.
 */
(function crearVentasDemo(global) {
  const { ErrorDeApi } = global.AramacaoApiCliente;
  const Util = global.AramacaoUtil;

  const CLAVE_ALMACEN = "aramacao-demo-ventas-v1";
  const MINUTOS_LIMITE_RECUPERACION = 20;

  /* Cliente ficticio usado por Taquilla para probar la recuperación de boletos. */
  const CLIENTE_DEMO = Object.freeze({
    id: "vista-local",
    nombre_completo: "Hugo Méndez",
    usuario: "hugomendez",
    tipo_identificacion: "IDENTIDAD_HN",
    identificacion_enmascarada: "0801-••••-•2345",
    identificacion_busqueda_demo: "0801199012345",
  });

  // -------------------------------------------------------------------
  // Lectura y escritura del almacén
  // -------------------------------------------------------------------

  function leerAlmacen() {
    try {
      const guardado = JSON.parse(global.localStorage.getItem(CLAVE_ALMACEN) || "null");
      if (guardado?.version === 1 && Array.isArray(guardado.compras)) return guardado;
    } catch {
      // Se reinicia únicamente el almacén de demostración dañado.
    }
    return { version: 1, compras: [] };
  }

  function guardarAlmacen(almacen) {
    global.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(almacen));
  }

  // -------------------------------------------------------------------
  // Crear una compra ya pagada
  // -------------------------------------------------------------------

  function crearCompraPagada(datos) {
    const asientos = normalizarAsientos(datos?.asientos);
    if (!datos?.bloqueo_id || !datos?.funcion_id || !asientos.length) {
      throw new ErrorDeApi(
        "La función, el bloqueo y los asientos son obligatorios.",
        400,
        "ERROR_VALIDACION"
      );
    }

    const almacen = leerAlmacen();
    /* Si el usuario reenvía el mismo bloqueo no se cobra ni se emite dos veces. */
    const repetida = almacen.compras.find((compra) => compra.bloqueo_id === datos.bloqueo_id);
    if (repetida) return structuredClone(repetida);

    const creadaEn = new Date();
    const compraId = Util.crearId();
    const canal = String(datos.canal || "ONLINE").toUpperCase();
    const referencia = crearReferencia(
      creadaEn,
      almacen.compras.length + 1,
      canal === "TAQUILLA" ? "TAQ" : "ARA"
    );

    const precioUnitario = Util.numeroDinero(datos.precio_unitario);
    const subtotal = Util.numeroDinero(datos.subtotal ?? asientos.length * precioUnitario);
    const descuento = Util.numeroDinero(datos.descuento);
    const total = Util.numeroDinero(datos.total ?? subtotal - descuento);

    /* El 2x1 se aplica de dos en dos: con 5 asientos, 4 entran en la promoción. */
    const hayPromocion = Boolean(datos.promocion_2x1);
    const asientosEnPromocion = hayPromocion ? Math.floor(asientos.length / 2) * 2 : 0;

    const boletos = asientos.map((asiento, indice) =>
      crearBoleto({ datos, compraId, referencia, asiento, indice, asientosEnPromocion })
    );

    const compra = {
      id: compraId,
      numero: referencia,
      referencia,
      bloqueo_id: String(datos.bloqueo_id),
      cliente_id: canal === "TAQUILLA"
        ? String(datos.cliente_id || "")
        : String(datos.cliente_id || CLIENTE_DEMO.id),
      cliente_nombre: String(datos.cliente_nombre || "Cliente de prueba"),
      cliente_usuario: canal === "TAQUILLA"
        ? String(datos.cliente_usuario || "")
        : String(datos.cliente_usuario || CLIENTE_DEMO.usuario),
      cliente_identificacion_enmascarada: canal === "TAQUILLA"
        ? String(datos.cliente_identificacion_enmascarada || "")
        : String(datos.cliente_identificacion_enmascarada || CLIENTE_DEMO.identificacion_enmascarada),
      pelicula: String(datos.pelicula || "Película"),
      pelicula_id: String(datos.pelicula_id || ""),
      funcion_id: String(datos.funcion_id),
      fecha_funcion: String(datos.fecha_funcion || ""),
      hora_funcion: String(datos.hora_funcion || ""),
      sala: String(datos.sala || "Sala 1"),
      formato: String(datos.formato || "2D"),
      asientos,
      promocion_2x1: asientosEnPromocion > 0,
      cantidad_boletos: boletos.length,
      subtotal,
      descuento,
      total,
      moneda: "HNL",
      estado: "PAGADA",
      estado_pago: "APROBADO_DEMO",
      canal,
      metodo_pago: String(
        datos.metodo_pago || (canal === "TAQUILLA" ? "EFECTIVO" : "ONLINE")
      ).toUpperCase(),
      vendedor_nombre: String(datos.vendedor_nombre || ""),
      efectivo_recibido: Util.numeroDinero(datos.efectivo_recibido),
      cambio: Util.numeroDinero(datos.cambio),
      fecha: creadaEn.toISOString(),
      creada_en: creadaEn.toISOString(),
      detalle: `${boletos.length} boleto(s) · ${asientos.join(", ")}`,
      items: boletos.map((boleto) => ({ id: boleto.id, descripcion: boleto.descripcion })),
      boletos,
      comprobante: {
        id: Util.crearId(),
        numero: `COMP-${referencia}`,
        tipo: "COMPROBANTE_NO_FISCAL_DEMOSTRACION",
      },
    };

    almacen.compras.unshift(compra);
    guardarAlmacen(almacen);
    return structuredClone(compra);
  }

  function crearBoleto({ datos, compraId, referencia, asiento, indice, asientosEnPromocion }) {
    const tienePromocion = indice < asientosEnPromocion;
    const posicionEnPar = tienePromocion ? (indice % 2) + 1 : null;
    const numeroDePar = tienePromocion ? Math.floor(indice / 2) + 1 : null;
    const tokenOpaco = crearTokenOpaco();

    return {
      id: Util.crearId(),
      numero: `${referencia}-${String(indice + 1).padStart(2, "0")}`,
      compra_id: compraId,
      funcion_id: String(datos.funcion_id),
      pelicula: String(datos.pelicula || "Película"),
      pelicula_id: String(datos.pelicula_id || ""),
      fecha_funcion: String(datos.fecha_funcion || ""),
      hora_funcion: String(datos.hora_funcion || ""),
      sala: String(datos.sala || "Sala 1"),
      formato: String(datos.formato || "2D"),
      asiento,
      estado: "RESERVADO",
      promocion_2x1: tienePromocion,
      grupo_2x1_id: tienePromocion ? `${compraId}-PAR-${numeroDePar}` : null,
      posicion_2x1: posicionEnPar,
      token_qr_demo: tokenOpaco,
      contenido_qr: `ARATK:${tokenOpaco}`,
      escaneado_en: null,
      descripcion: describirBoleto(datos, asiento, tienePromocion, posicionEnPar),
    };
  }

  // -------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------

  function listarCompras({ estado = "" } = {}) {
    const estadoBuscado = String(estado || "").toUpperCase();
    const compras = leerAlmacen().compras.filter((compra) =>
      esCompraEnLinea(compra) && (!estadoBuscado || compra.estado === estadoBuscado)
    );
    return { total: compras.length, resultados: structuredClone(compras) };
  }

  function obtenerCompra(compraId) {
    const compra = leerAlmacen().compras.find((item) => item.id === compraId);
    if (!compra) {
      throw new ErrorDeApi("No se encontró la compra de demostración.", 404, "RECURSO_NO_ENCONTRADO");
    }
    return { compra: structuredClone(compra) };
  }

  function obtenerBoleto(boletoId) {
    for (const compra of leerAlmacen().compras) {
      const boleto = compra.boletos.find((item) => item.id === boletoId);
      if (boleto) return { purchase: structuredClone(compra), ticket: structuredClone(boleto) };
    }
    throw new ErrorDeApi("No se encontró el boleto.", 404, "BOLETO_NO_ENCONTRADO");
  }

  /* Un boleto solo se imprime mientras siga reservado (aún no entró a sala). */
  function obtenerBoletoImprimible(boletoId) {
    const { purchase, ticket } = obtenerBoleto(boletoId);
    if (ticket.estado !== "RESERVADO") {
      throw new ErrorDeApi(
        ticket.estado === "OCUPADO"
          ? "Este boleto ya registró el ingreso y no puede imprimirse como boleto válido."
          : "Este boleto ya no está vigente y no puede imprimirse.",
        409,
        "BOLETO_NO_IMPRIMIBLE"
      );
    }
    return { purchase, ticket };
  }

  /* Le dice a seat-api qué asientos ya están vendidos en una función. */
  function obtenerEstadosAsientos(funcionId) {
    const reservados = [];
    const ocupados = [];
    leerAlmacen().compras.forEach((compra) => {
      compra.boletos.forEach((boleto) => {
        if (String(boleto.funcion_id) !== String(funcionId)) return;
        if (boleto.estado === "OCUPADO") ocupados.push(boleto.asiento);
        else if (boleto.estado === "RESERVADO") reservados.push(boleto.asiento);
      });
    });
    return { reservados, ocupados };
  }

  function listarVentasAdministracion(filtros = {}) {
    const busqueda = Util.normalizarTexto(filtros.buscar);
    const estado = String(filtros.estado || "").trim().toUpperCase();
    const canal = String(filtros.canal || "").trim().toUpperCase();
    const metodoPago = String(filtros.metodo_pago || "").trim().toUpperCase();
    const desde = normalizarFiltroFecha(filtros.fecha_desde);
    const hasta = normalizarFiltroFecha(filtros.fecha_hasta);

    const compras = leerAlmacen().compras.filter((compra) => {
      const fechaCompra = String(compra.fecha || compra.creada_en || "").slice(0, 10);
      const textoBuscable = Util.normalizarTexto([
        compra.numero,
        compra.referencia,
        compra.cliente_nombre,
        compra.pelicula,
        compra.vendedor_nombre,
        ...(compra.asientos || []),
        ...(compra.boletos || []).map((boleto) => boleto.numero),
      ].join(" "));

      return (!busqueda || textoBuscable.includes(busqueda))
        && (!estado || String(compra.estado || "").toUpperCase() === estado)
        && (!canal || String(compra.canal || "ONLINE").toUpperCase() === canal)
        && (!metodoPago || String(compra.metodo_pago || "").toUpperCase() === metodoPago)
        && (!desde || fechaCompra >= desde)
        && (!hasta || fechaCompra <= hasta);
    });

    const pagadas = compras.filter((compra) => compra.estado === "PAGADA");
    return {
      total: compras.length,
      resumen: {
        total_ventas: compras.length,
        ventas_online: compras.filter(esCompraEnLinea).length,
        ventas_taquilla: compras.filter((compra) => !esCompraEnLinea(compra)).length,
        monto_total: Util.numeroDinero(
          pagadas.reduce((suma, compra) => suma + Util.numeroDinero(compra.total), 0)
        ).toFixed(2),
      },
      resultados: structuredClone(compras),
    };
  }

  // -------------------------------------------------------------------
  // Recuperación de boletos en taquilla
  // -------------------------------------------------------------------

  function buscarClientesRecuperacion(criterio, valor) {
    const buscado = Util.normalizarComparacion(valor);
    const valorDelCliente = criterio === "IDENTIFICACION"
      ? CLIENTE_DEMO.identificacion_busqueda_demo
      : criterio === "USUARIO"
        ? CLIENTE_DEMO.usuario
        : CLIENTE_DEMO.nombre_completo;

    const hayComprasEnLinea = leerAlmacen().compras.some(esCompraEnLinea);
    const coincide = Util.normalizarComparacion(valorDelCliente).includes(buscado);
    const encontrados = coincide && hayComprasEnLinea ? [clienteDemoPublico()] : [];
    return { total: encontrados.length, resultados: structuredClone(encontrados) };
  }

  function listarComprasRecuperables(clienteId) {
    if (String(clienteId) !== CLIENTE_DEMO.id) {
      throw new ErrorDeApi("No se encontró el cliente.", 404, "CLIENTE_NO_ENCONTRADO");
    }

    const compras = leerAlmacen().compras
      .filter(esCompraEnLinea)
      .filter(esCompraVigente)
      .sort(compararPorInicioDeFuncion)
      .map((compra) => ({
        ...compra,
        boletos: (compra.boletos || []).map((boleto) => ({
          ...boleto,
          ...evaluarRecuperacion(compra, boleto),
        })),
      }));

    return {
      cliente: clienteDemoPublico(),
      total: compras.length,
      resultados: structuredClone(compras),
    };
  }

  function recuperarBoletoTaquilla(boletoId, clienteId, motivo) {
    const almacen = leerAlmacen();
    const ubicado = ubicarBoleto(almacen, boletoId);

    const duenoId = ubicado.compra.cliente_id
      || (esCompraEnLinea(ubicado.compra) ? CLIENTE_DEMO.id : "");
    if (String(clienteId) !== duenoId) {
      throw new ErrorDeApi("El boleto no pertenece al cliente verificado.", 404, "BOLETO_NO_ENCONTRADO");
    }

    const elegibilidad = evaluarRecuperacion(ubicado.compra, ubicado.boleto);
    if (!elegibilidad.recuperable) {
      throw new ErrorDeApi(
        elegibilidad.motivo_no_recuperable,
        409,
        ubicado.boleto.estado === "OCUPADO" ? "BOLETO_YA_UTILIZADO" : "BOLETO_NO_RECUPERABLE"
      );
    }

    const resultado = reemitirBoleto(boletoId, motivo, {
      accion: "BOLETO_RECUPERADO_TAQUILLA",
      empleado: "Vendedor de Taquilla local",
    });
    return { ...resultado, codigo: "BOLETO_RECUPERADO" };
  }

  /* Explica en palabras por qué un boleto puede o no reimprimirse en taquilla. */
  function evaluarRecuperacion(compra, boleto) {
    if (String(compra.estado || "").toUpperCase() !== "PAGADA") {
      return { recuperable: false, motivo_no_recuperable: "La venta no está pagada." };
    }

    const estado = String(boleto.estado || "").toUpperCase();
    if (estado === "OCUPADO") {
      const cuando = boleto.escaneado_en
        ? ` el ${Util.formatearFechaHora(boleto.escaneado_en, { alterno: "fecha desconocida" })}`
        : "";
      return { recuperable: false, motivo_no_recuperable: `El ingreso ya fue registrado${cuando}.` };
    }
    if (estado !== "RESERVADO") {
      return {
        recuperable: false,
        motivo_no_recuperable: `El boleto está ${estado.toLowerCase()} y ya no es válido.`,
      };
    }

    const limite = limiteDeRecuperacion(compra.fecha_funcion, compra.hora_funcion);
    if (limite && Date.now() > limite.getTime()) {
      return {
        recuperable: false,
        motivo_no_recuperable: "Terminó el plazo de recuperación: han pasado más de 20 minutos desde el inicio de la función.",
      };
    }
    return { recuperable: true, motivo_no_recuperable: "" };
  }

  // -------------------------------------------------------------------
  // Reemisión, anulación y reembolso
  // -------------------------------------------------------------------

  function reemitirBoleto(boletoId, motivo, auditoria = {}) {
    const almacen = leerAlmacen();
    const { compra, boleto } = ubicarBoleto(almacen, boletoId);

    if (compra.estado !== "PAGADA") {
      throw new ErrorDeApi("La venta no está pagada y no permite reemitir boletos.", 409, "VENTA_NO_REEMITIBLE");
    }
    if (boleto.estado !== "RESERVADO") {
      throw new ErrorDeApi(
        boleto.estado === "OCUPADO"
          ? "El boleto ya fue utilizado y no puede reemitirse."
          : "El boleto anulado o reembolsado no puede reemitirse.",
        409,
        "BOLETO_NO_REEMITIBLE"
      );
    }

    /* Reemitir invalida el QR anterior: se genera un token nuevo. */
    const ahora = new Date().toISOString();
    const numeroReemision = Number(boleto.numero_reemisiones || 0) + 1;
    const tokenNuevo = crearTokenOpaco();

    boleto.token_qr_demo = tokenNuevo;
    boleto.contenido_qr = `ARATK:${tokenNuevo}`;
    boleto.numero_reemisiones = numeroReemision;
    boleto.reemitido_en = ahora;
    boleto.historial_reemisiones = [
      ...(Array.isArray(boleto.historial_reemisiones) ? boleto.historial_reemisiones : []),
      { numero: numeroReemision, motivo: String(motivo).trim(), fecha: ahora },
    ];

    registrarAuditoria(compra, auditoria.accion || "BOLETO_REEMITIDO", motivo, {
      boleto_id: boletoId,
      empleado: auditoria.empleado || "Administrador local de demostración",
    });
    guardarAlmacen(almacen);

    return {
      codigo: "BOLETO_REEMITIDO",
      mensaje: "El QR anterior quedó invalidado y se generó uno nuevo.",
      boleto: structuredClone(boleto),
    };
  }

  function cambiarEstadoVenta(ventaId, motivo, estadoDestino) {
    const almacen = leerAlmacen();
    const compra = almacen.compras.find((item) => item.id === ventaId);

    if (!compra) {
      throw new ErrorDeApi("No se encontró la venta.", 404, "VENTA_NO_ENCONTRADA");
    }
    if (compra.estado !== "PAGADA") {
      throw new ErrorDeApi("La venta ya tiene un estado final.", 409, "VENTA_ESTADO_FINAL");
    }
    /* Si alguien ya entró a la sala con un boleto, el caso necesita revisión humana. */
    if ((compra.boletos || []).some((boleto) => boleto.estado === "OCUPADO")) {
      throw new ErrorDeApi(
        "La venta contiene boletos ya utilizados y requiere revisión del encargado.",
        409,
        "VENTA_CON_INGRESOS_REGISTRADOS"
      );
    }

    const ahora = new Date().toISOString();
    const esAnulacion = estadoDestino === "ANULADA";

    compra.estado = estadoDestino;
    compra.estado_pago = esAnulacion ? "ANULADO_DEMO" : "REEMBOLSADO_DEMO";
    compra.actualizada_en = ahora;
    compra.boletos.forEach((boleto) => {
      boleto.estado = esAnulacion ? "ANULADO" : "REEMBOLSADO";
      boleto.anulado_en = ahora;
    });

    registrarAuditoria(compra, esAnulacion ? "VENTA_ANULADA" : "VENTA_REEMBOLSADA", motivo);
    guardarAlmacen(almacen);

    return {
      codigo: esAnulacion ? "VENTA_ANULADA" : "VENTA_REEMBOLSADA",
      mensaje: esAnulacion
        ? "La venta y sus boletos fueron anulados."
        : "El reembolso de demostración fue registrado y los boletos quedaron invalidados.",
      compra: structuredClone(compra),
    };
  }

  // -------------------------------------------------------------------
  // Control de entrada
  // -------------------------------------------------------------------

  function escanearBoleto(token) {
    const almacen = leerAlmacen();
    let compraEncontrada = null;
    let boletoEncontrado = null;

    for (const compra of almacen.compras) {
      const boleto = compra.boletos.find((item) => item.token_qr_demo === token);
      if (boleto) {
        compraEncontrada = compra;
        boletoEncontrado = boleto;
        break;
      }
    }

    if (!boletoEncontrado) {
      throw new ErrorDeApi("El QR no pertenece a un boleto válido.", 404, "BOLETO_NO_ENCONTRADO");
    }
    /* Regla de negocio: cada QR sirve una sola vez. */
    if (boletoEncontrado.estado === "OCUPADO") {
      throw new ErrorDeApi(
        `Este boleto ya fue utilizado el ${Util.formatearFechaHora(boletoEncontrado.escaneado_en, { alterno: "fecha desconocida" })}.`,
        409,
        "BOLETO_YA_UTILIZADO",
        { escaneado_en: boletoEncontrado.escaneado_en, asiento: boletoEncontrado.asiento }
      );
    }
    if (boletoEncontrado.estado !== "RESERVADO") {
      throw new ErrorDeApi("El boleto no está disponible para ingresar.", 409, "BOLETO_NO_VALIDO");
    }

    boletoEncontrado.estado = "OCUPADO";
    boletoEncontrado.escaneado_en = new Date().toISOString();
    guardarAlmacen(almacen);

    /* Si el boleto es parte de un 2x1, se avisa si falta escanear su pareja. */
    const pareja = boletoEncontrado.grupo_2x1_id
      ? compraEncontrada.boletos.find((boleto) =>
        boleto.grupo_2x1_id === boletoEncontrado.grupo_2x1_id && boleto.id !== boletoEncontrado.id)
      : null;

    return {
      codigo: "INGRESO_REGISTRADO",
      mensaje: "Ingreso registrado correctamente.",
      boleto: resumirBoletoParaEscaner(compraEncontrada, boletoEncontrado),
      pareja_2x1: pareja
        ? { asiento: pareja.asiento, estado: pareja.estado, falta_escanear: pareja.estado === "RESERVADO" }
        : null,
    };
  }

  // -------------------------------------------------------------------
  // Apoyos internos
  // -------------------------------------------------------------------

  function ubicarBoleto(almacen, boletoId) {
    for (const compra of almacen.compras) {
      const boleto = (compra.boletos || []).find((item) => item.id === boletoId);
      if (boleto) return { compra, boleto };
    }
    throw new ErrorDeApi("No se encontró el boleto.", 404, "BOLETO_NO_ENCONTRADO");
  }

  function registrarAuditoria(compra, accion, motivo, extra = {}) {
    compra.auditoria = [
      ...(Array.isArray(compra.auditoria) ? compra.auditoria : []),
      {
        id: Util.crearId(),
        accion,
        motivo: String(motivo).trim(),
        fecha: new Date().toISOString(),
        empleado: "Administrador local de demostración",
        ...extra,
      },
    ];
  }

  function clienteDemoPublico() {
    return {
      id: CLIENTE_DEMO.id,
      nombre_completo: CLIENTE_DEMO.nombre_completo,
      usuario: CLIENTE_DEMO.usuario,
      tipo_identificacion: CLIENTE_DEMO.tipo_identificacion,
      identificacion_enmascarada: CLIENTE_DEMO.identificacion_enmascarada,
    };
  }

  function resumirBoletoParaEscaner(compra, boleto) {
    return {
      id: boleto.id,
      numero: boleto.numero,
      funcion_id: boleto.funcion_id,
      estado: boleto.estado,
      escaneado_en: boleto.escaneado_en,
      comprador: compra.cliente_nombre,
      pelicula: compra.pelicula,
      fecha_funcion: compra.fecha_funcion,
      hora_funcion: compra.hora_funcion,
      sala: compra.sala,
      formato: compra.formato,
      asiento: boleto.asiento,
      promocion_2x1: boleto.promocion_2x1,
      posicion_2x1: boleto.posicion_2x1,
    };
  }

  function describirBoleto(datos, asiento, tienePromocion, posicionEnPar) {
    const base = `${datos.pelicula || "Película"} · ${datos.fecha_funcion || ""} ${datos.hora_funcion || ""} · ${datos.formato || "2D"} · Asiento ${asiento}`;
    return tienePromocion ? `${base} · 2x1 (${posicionEnPar} de 2)` : base;
  }

  function esCompraEnLinea(compra) {
    return String(compra.canal || "ONLINE").toUpperCase() !== "TAQUILLA";
  }

  function esCompraVigente(compra) {
    const fecha = String(compra?.fecha_funcion || "");
    return Util.esFechaIso(fecha) && fecha >= Util.fechaDeHoyEnHonduras();
  }

  function compararPorInicioDeFuncion(izquierda, derecha) {
    const inicioIzquierda = inicioDeFuncion(izquierda?.fecha_funcion, izquierda?.hora_funcion)?.getTime()
      ?? Number.MAX_SAFE_INTEGER;
    const inicioDerecha = inicioDeFuncion(derecha?.fecha_funcion, derecha?.hora_funcion)?.getTime()
      ?? Number.MAX_SAFE_INTEGER;
    return inicioIzquierda - inicioDerecha;
  }

  function limiteDeRecuperacion(fecha, hora) {
    const inicio = inicioDeFuncion(fecha, hora);
    if (!inicio) return null;
    inicio.setMinutes(inicio.getMinutes() + MINUTOS_LIMITE_RECUPERACION);
    return inicio;
  }

  /* Las horas se guardan como texto visible ("8:00 p. m."), así que hay que
     interpretarlas para poder compararlas con el reloj. */
  function inicioDeFuncion(fecha, hora) {
    if (!Util.esFechaIso(fecha)) return null;

    const horaTexto = String(hora || "").toLocaleLowerCase("es-HN");
    const partes = horaTexto.match(/(\d{1,2})(?::(\d{2}))?/);
    if (!partes) return null;

    let horas = Number(partes[1]);
    const minutos = Number(partes[2] || 0);
    const esTarde = /p\.?\s*m\.?/.test(horaTexto);
    const esManana = /a\.?\s*m\.?/.test(horaTexto);
    if (esTarde && horas < 12) horas += 12;
    if (esManana && horas === 12) horas = 0;

    const inicio = new Date(
      `${fecha}T${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:00-06:00`
    );
    return Number.isNaN(inicio.getTime()) ? null : inicio;
  }

  function normalizarFiltroFecha(valor) {
    const texto = String(valor || "").trim();
    return Util.esFechaIso(texto) ? texto : "";
  }

  /* Solo acepta asientos que existan en la Sala 1 (filas A–H, butacas 1–14). */
  function normalizarAsientos(asientos) {
    const lista = Array.isArray(asientos) ? asientos : [];
    return [...new Set(
      lista
        .map((asiento) => String(asiento || "").trim().toUpperCase())
        .filter((asiento) => /^[A-H](?:[1-9]|1[0-4])$/.test(asiento))
    )].sort(Util.compararAsientos);
  }

  function crearReferencia(fecha, secuencia, prefijo = "ARA") {
    const marca = [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1).padStart(2, "0"),
      String(fecha.getDate()).padStart(2, "0"),
      String(fecha.getHours()).padStart(2, "0"),
      String(fecha.getMinutes()).padStart(2, "0"),
      String(fecha.getSeconds()).padStart(2, "0"),
    ].join("");
    return `${prefijo}-${marca}-${String(secuencia).padStart(3, "0")}`;
  }

  /* Token largo y sin significado: el QR no debe dejar adivinar otro boleto. */
  function crearTokenOpaco() {
    return `${Util.crearId().replaceAll("-", "")}${Util.crearId().replaceAll("-", "")}`;
  }

  global.AramacaoVentasDemo = Object.freeze({
    crearCompraPagada,
    listarCompras,
    obtenerCompra,
    obtenerBoleto,
    obtenerBoletoImprimible,
    obtenerEstadosAsientos,
    listarVentasAdministracion,
    buscarClientesRecuperacion,
    listarComprasRecuperables,
    recuperarBoletoTaquilla,
    reemitirBoleto,
    cambiarEstadoVenta,
    escanearBoleto,
  });
})(window);
