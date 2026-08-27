window.LUCIA_HISTORY = {
  "meta": {
    "fuente_correo": "HubSpot Reports Dashboard 6180490 · vista 20862583",
    "fuente_chat": "HubSpot Reports Dashboard 6180490 · vista 20257473",
    "fuente_llamadas": "HubSpot CRM objeto CALL (filtrado por bot_calificador) + ElevenLabs Conversational AI API",
    "nota": "El primer snapshot de Correo/Chat (id boot-2026-07-01) es un acumulado inicial que cubre varias semanas juntas. El de Llamadas (id llamadas-boot-2026-08-10) arrancó después, por eso cubre solo la semana del 10-16 ago 2026 — es su propio punto de partida, no está desalineado por error. A partir de ahora cada snapshot nuevo debe cubrir exactamente una semana e idealmente traer correo, chat Y llamadas juntos. Ver INSTRUCTIVO.md secciones 4 y 7."
  },
  "snapshots": [
    {
      "id": "boot-2026-07-01",
      "semana_inicio": "2026-07-01",
      "semana_fin": "2026-08-19",
      "generado": "2026-08-19",
      "bootstrap": true,
      "etiqueta": "01 jul – 19 ago 2026 (acumulado inicial)",
      "correo": {
        "kpis": {
          "demanda": 689,
          "gestionados": 218,
          "escalados": 199,
          "pct_gestion": 31.64
        },
        "_nota_correccion_25ago2026": "gestionados/escalados recalculados (25-ago-2026) con la definición REAL de los widgets de HubSpot, confirmada exacta contra el panel en vivo vía API: Gestionados = tickets con Propietario = 'Lucía Pérez' (no 'categoria_bot_lucia' como se asumió el 21-ago); Escalados = tickets con la propiedad 'escalamiento_lucia_email' conocida (no 'categoria_bot_lucia' tampoco). Ambas excluyen la pipeline 'Correos que no requieren respuesta' (mismo ruido de notificaciones automáticas de la corrección anterior) y se limitan a Fuente=Correo, creados entre 01-jul y 19-ago-2026 (mismo periodo que 'demanda'). 226/411 (definición anterior, basada en categoria_bot_lucia) quedan obsoletos. Ver INSTRUCTIVO.md sección 1.10 para el mapeo completo y las consultas SQL listas para la automatización por API.",
        "por_stage": [
          {
            "stage": "Closed (COL_Sup)",
            "count": 174
          },
          {
            "stage": "Cerrados (Consultas API_Sup)",
            "count": 19
          },
          {
            "stage": "Closed (Nómina_Sup)",
            "count": 10
          },
          {
            "stage": "Closed (Payments Sup)",
            "count": 9
          },
          {
            "stage": "Verificación de cliente (Tickets Sales)",
            "count": 3
          },
          {
            "stage": "Waiting on contact (COL_Sup)",
            "count": 3
          },
          {
            "stage": "Follow up (COL_Sup)",
            "count": 3
          },
          {
            "stage": "Closed (POS_Sup)",
            "count": 2
          },
          {
            "stage": "Gestionados (Retention)",
            "count": 1
          },
          {
            "stage": "Waiting on us (COL_Sup)",
            "count": 1
          }
        ],
        "tendencia_semanal": [
          {
            "semana": "2026-06-29",
            "escaladas": 9,
            "gestionadas": 7
          },
          {
            "semana": "2026-07-06",
            "escaladas": 37,
            "gestionadas": 51
          },
          {
            "semana": "2026-07-13",
            "escaladas": 30,
            "gestionadas": 16
          },
          {
            "semana": "2026-07-20",
            "escaladas": 28,
            "gestionadas": 12
          },
          {
            "semana": "2026-07-27",
            "escaladas": 29,
            "gestionadas": 28
          },
          {
            "semana": "2026-08-03",
            "escaladas": 34,
            "gestionadas": 21
          },
          {
            "semana": "2026-08-10",
            "escaladas": 28,
            "gestionadas": 76
          },
          {
            "semana": "2026-08-17",
            "escaladas": 10,
            "gestionadas": 20
          },
          {
            "semana": "2026-08-24",
            "escaladas": 8,
            "gestionadas": 8
          }
        ],
        "csat": {
          "nota": "Fuente: propiedad de HubSpot 'clasificacion_encuesta_ces_csat' (Promoter/Neutro/Detractor), tickets de Correo. No hay puntaje individual 1-10 capturado en HubSpot para este pipeline, por eso se agrupa en las 3 categorías NPS en vez de un eje 1-10. No se pudo aislar solo lo gestionado por el bot Lucía vs. gestión humana dentro del pipeline (ver INSTRUCTIVO.md sección 1.6).",
          "serie_semanal": [
            {
              "semana": "2026-06-29",
              "promoter": 19,
              "passive": 1,
              "detractor": 3
            },
            {
              "semana": "2026-07-06",
              "promoter": 26,
              "passive": 0,
              "detractor": 5
            },
            {
              "semana": "2026-07-13",
              "promoter": 13,
              "passive": 1,
              "detractor": 6
            },
            {
              "semana": "2026-07-20",
              "promoter": 19,
              "passive": 1,
              "detractor": 4
            },
            {
              "semana": "2026-07-27",
              "promoter": 27,
              "passive": 0,
              "detractor": 5
            },
            {
              "semana": "2026-08-03",
              "promoter": 26,
              "passive": 1,
              "detractor": 2
            },
            {
              "semana": "2026-08-10",
              "promoter": 20,
              "passive": 1,
              "detractor": 1
            },
            {
              "semana": "2026-08-17",
              "promoter": 15,
              "passive": 0,
              "detractor": 2
            }
          ]
        }
      },
      "chat": {
        "kpis": {
          "demanda": 4409,
          "ingresados_bot": 3914,
          "escalados": 1175,
          "gestionados": 2735,
          "pct_gestion": 69.88,
          "csat_bot": 88.01
        },
        "ingresados_por_version": [
          {
            "version": "COL",
            "count": 311
          },
          {
            "version": "MEX",
            "count": 278
          },
          {
            "version": "DOM",
            "count": 40
          },
          {
            "version": "CRI",
            "count": 80
          },
          {
            "version": "PER",
            "count": 301
          },
          {
            "version": "VEN",
            "count": 303
          },
          {
            "version": "OTHER",
            "count": 0
          }
        ],
        "tiempo_promedio_solucion_min": 102.9,
        "motivos_solicitud": {
          "COL_AC": [
            {
              "motivo": "Configuración Numeración",
              "count": 114
            },
            {
              "motivo": "Traslado de cuenta",
              "count": 71
            },
            {
              "motivo": "Suscripción plan",
              "count": 51
            },
            {
              "motivo": "Conciliar bancos",
              "count": 47
            },
            {
              "motivo": "Saldos iniciales",
              "count": 44
            },
            {
              "motivo": "Pregunta por issue",
              "count": 44
            },
            {
              "motivo": "Reporte de impuestos",
              "count": 41
            },
            {
              "motivo": "Integraciones",
              "count": 38
            }
          ],
          "Payments": [
            {
              "motivo": "Cancelar suscripción",
              "count": 38
            },
            {
              "motivo": "Solicita descuento",
              "count": 28
            },
            {
              "motivo": "Cambio de producto",
              "count": 23
            },
            {
              "motivo": "Suspendido/bloqueado",
              "count": 22
            },
            {
              "motivo": "Retención factura",
              "count": 21
            },
            {
              "motivo": "Abono a la siguiente",
              "count": 18
            }
          ],
          "Countries_AC": [
            {
              "motivo": "Nota crédito electrónica",
              "count": 8
            },
            {
              "motivo": "Administrador XML",
              "count": 8
            },
            {
              "motivo": "Cambio de moneda",
              "count": 7
            },
            {
              "motivo": "Configuración datos",
              "count": 7
            },
            {
              "motivo": "Lentitud al generar",
              "count": 6
            }
          ],
          "Contador": [
            {
              "motivo": "Emisión Documento",
              "count": 12
            },
            {
              "motivo": "Asesoría",
              "count": 9
            },
            {
              "motivo": "Cambio de plan",
              "count": 8
            },
            {
              "motivo": "Facturación electrónica",
              "count": 7
            },
            {
              "motivo": "Pagos recibidos",
              "count": 5
            }
          ],
          "POS": [
            {
              "motivo": "Plantillas de impresión",
              "count": 19
            },
            {
              "motivo": "Listas de precios",
              "count": 12
            },
            {
              "motivo": "Usuario resolvió la duda",
              "count": 12
            },
            {
              "motivo": "Reporte de transacciones",
              "count": 10
            },
            {
              "motivo": "Configuración dispositivo",
              "count": 10
            }
          ],
          "NE": [
            {
              "motivo": "Terminación de contrato",
              "count": 31
            },
            {
              "motivo": "Configuración empleado",
              "count": 24
            },
            {
              "motivo": "Dudas botón liquidación",
              "count": 21
            },
            {
              "motivo": "Configurar deducción",
              "count": 20
            },
            {
              "motivo": "Configuración inicial",
              "count": 15
            }
          ]
        }
      }
    },
    {
      "id": "llamadas-boot-2026-08-10",
      "semana_inicio": "2026-08-10",
      "semana_fin": "2026-08-16",
      "generado": "2026-08-21",
      "bootstrap": true,
      "etiqueta": "10 – 16 ago 2026 (primera semana de Llamadas)",
      "correo": null,
      "chat": null,
      "llamadas": {
        "kpis": {
          "demanda": 1351,
          "gestionadas": 251,
          "escaladas": 1030,
          "no_contestadas": 68,
          "sin_clasificar": 2,
          "pct_gestion": 18.58,
          "duracion_prom_seg": 205.3
        },
        "por_version": [
          {
            "version": "COL",
            "bot_calificador": "lucia-ivr",
            "demanda": 1064,
            "gestionadas": 200,
            "escaladas": 825,
            "no_contestadas": 37,
            "sin_clasificar": 2,
            "pct_gestion": 18.8,
            "duracion_prom_seg": 199.9
          },
          {
            "version": "DOM",
            "bot_calificador": "lucia-ivr-dom",
            "demanda": 165,
            "gestionadas": 14,
            "escaladas": 130,
            "no_contestadas": 21,
            "sin_clasificar": 0,
            "pct_gestion": 8.5,
            "duracion_prom_seg": 165
          },
          {
            "version": "Fuera de horario",
            "bot_calificador": "lucia ivr fuerahorario",
            "demanda": 122,
            "gestionadas": 37,
            "escaladas": 75,
            "no_contestadas": 10,
            "sin_clasificar": 0,
            "pct_gestion": 30.3,
            "duracion_prom_seg": 306.8
          }
        ],
        "motivo_escalamiento": [
          {
            "motivo": "Petición del usuario",
            "count": 520
          },
          {
            "motivo": "Desconocimiento",
            "count": 499
          },
          {
            "motivo": "Falta de acceso",
            "count": 8
          },
          {
            "motivo": "Error de cobro",
            "count": 3
          }
        ],
        "elevenlabs": {
          "fuente": "ElevenLabs Conversational AI API (/v1/convai/conversations)",
          "nota": "pct_completadas_sin_error_tecnico mide si la llamada terminó su flujo técnico sin error (incluye llamadas que terminaron en escalamiento a humano) — NO es lo mismo que 'gestionadas' arriba, que mide si se resolvió SIN necesitar un humano (dato de negocio, de HubSpot). No mostrar las dos cifras una al lado de la otra como si fueran comparables.",
          "cobertura_incompleta": "No incluye el bot 'Fuera de horario' — su agent_id de ElevenLabs todavía no está agregado a elevenlabs_config.json.",
          "totales": {
            "llamadas": 1240,
            "duracion_prom_seg": 193.8,
            "pct_completadas_sin_error_tecnico": 98
          },
          "por_version": [
            {
              "version": "COL",
              "agent_id": "agent_8901kwz1p1zkfec9pw3867ekabfb",
              "llamadas": 1073,
              "duracion_prom_seg": 198.5,
              "mensajes_prom": 29.7,
              "pct_completadas_sin_error_tecnico": 97.7
            },
            {
              "version": "DOM",
              "agent_id": "agent_5001kyq7xfgvezr8c512tkabns84",
              "llamadas": 167,
              "duracion_prom_seg": 163.1,
              "mensajes_prom": 28.3,
              "pct_completadas_sin_error_tecnico": 100
            }
          ]
        }
      }
    }
  ]
};
