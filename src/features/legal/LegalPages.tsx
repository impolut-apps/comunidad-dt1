import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { brand } from '@/lib/brand'

/**
 * Legal texts. DRAFTS written to reflect what the app actually does — they MUST be reviewed by a
 * lawyer before public launch. Fields marked [●] need the company's real data.
 */
export const LEGAL_VERSION = '2026-11-v1'
const UPDATED = '8 de noviembre de 2026'

function LegalShell({ title, children, draft = true }: { title: string; children: ReactNode; draft?: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 pb-16">
      <button onClick={() => navigate(-1)} className="-ml-2 mb-4 rounded-full p-2 text-muted hover:bg-surface-muted" aria-label="Volver">
        <ArrowLeft size={22} />
      </button>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Última actualización: {UPDATED}</p>
      {draft && (
        <div className="mt-4 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          Borrador pendiente de revisión legal. Los datos marcados con [●] deben completarse antes del lanzamiento.
        </div>
      )}
      <div className="legal mt-6 space-y-6 text-[15px] leading-relaxed text-text [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_ul>li]:ml-5 [&_ul>li]:list-disc [&_ul>li]:pl-1 [&_p]:text-muted [&_ul]:space-y-1.5 [&_ul]:text-muted">
        {children}
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <LegalShell title="Política de privacidad">
      <section>
        <p>
          En {brand.name} sabemos que formar parte de esta comunidad implica compartir algo personal: que vives con
          diabetes tipo 1. Por eso tratamos tus datos con el mínimo necesario y con especial cuidado. Aquí te
          explicamos, sin letra pequeña, qué datos usamos, para qué y qué puedes hacer.
        </p>
      </section>

      <section>
        <h2>1. Quién es responsable de tus datos</h2>
        <ul>
          <li>Responsable: [●] (razón social), NIF [●].</li>
          <li>Dirección: [●].</li>
          <li>Contacto de privacidad: [●] (email).</li>
          <li>Delegado de protección de datos, si se designa: [●].</li>
        </ul>
      </section>

      <section>
        <h2>2. Un dato especial: tu salud</h2>
        <p>
          Ser miembro de {brand.name} implica que vives con diabetes tipo 1. Eso es un dato de salud, una «categoría
          especial» según el artículo 9 del RGPD. Solo lo tratamos con tu <strong>consentimiento explícito</strong>,
          que nos das al crear la cuenta, y únicamente para darte acceso a la comunidad. Puedes retirarlo cuando
          quieras borrando tu cuenta desde Ajustes. No pedimos historiales médicos, niveles de glucosa, tratamientos
          ni ningún otro dato clínico.
        </p>
      </section>

      <section>
        <h2>3. Qué datos tratamos</h2>
        <ul>
          <li><strong>Cuenta:</strong> email y contraseña (guardada cifrada; nadie del equipo puede verla).</li>
          <li><strong>Perfil:</strong> nombre visible, nombre de usuario, foto (opcional), país y ciudad, rango de edad (opcional), biografía, intereses y, si quieres, desde qué año vives con T1 y una frase sobre tu experiencia.</li>
          <li><strong>Lo que compartes:</strong> publicaciones, comentarios, reacciones, planes, mensajes, fotos, notas de voz y stickers.</li>
          <li><strong>Relaciones:</strong> conexiones, planes a los que te apuntas, grupos a los que te unes, bloqueos y reportes.</li>
          <li><strong>Consentimientos:</strong> fecha y versión de los textos que aceptaste.</li>
          <li><strong>Uso:</strong> la última vez que abriste la app (con precisión de una hora) y registros técnicos de seguridad de nuestros proveedores.</li>
        </ul>
        <p className="mt-2">
          <strong>Nunca</strong> recogemos tu ubicación precisa: solo la ciudad que escribes. Las fotos se procesan en
          tu móvil antes de subirse, lo que elimina los metadatos de ubicación (GPS) que añaden las cámaras.
        </p>
      </section>

      <section>
        <h2>4. Para qué y con qué base legal</h2>
        <ul>
          <li>Darte el servicio (perfil, descubrir gente, planes, mensajes, grupos, muro): ejecución del contrato que aceptas con las Condiciones de uso (art. 6.1.b RGPD) y, para el dato de salud, tu consentimiento explícito (art. 9.2.a).</li>
          <li>Seguridad y moderación (reportes, bloqueos, prevención de spam y abusos): interés legítimo en mantener una comunidad segura (art. 6.1.f).</li>
          <li>Estadísticas internas agregadas (por ejemplo, cuántas personas hay por ciudad): interés legítimo en mejorar el servicio. Son recuentos; no creamos perfiles individuales.</li>
          <li>Emails del servicio (confirmar cuenta, recuperar contraseña): ejecución del contrato.</li>
        </ul>
      </section>

      <section>
        <h2>5. Lo que no hacemos</h2>
        <ul>
          <li>No vendemos ni alquilamos tus datos.</li>
          <li>No mostramos publicidad ni usamos tus datos para anunciantes.</li>
          <li>No usamos cookies de seguimiento. Solo guardamos en tu dispositivo lo técnico imprescindible: tu sesión, el tema claro/oscuro y tus emojis recientes.</li>
          <li>No damos consejo médico ni analizamos tu salud.</li>
        </ul>
      </section>

      <section>
        <h2>6. Quién puede ver qué</h2>
        <ul>
          <li>Tu perfil, publicaciones y planes solo los ven miembros registrados con el email verificado. No son públicos en internet.</li>
          <li>Los mensajes privados solo los ven las personas de esa conversación. Los mensajes de un grupo, quienes están en él.</li>
          <li>Las fotos y audios se guardan en almacenamiento privado y se muestran mediante enlaces temporales.</li>
          <li>Si bloqueas a alguien, ninguno de los dos veréis el contenido del otro.</li>
          <li>Los moderadores pueden ver el contenido que alguien ha reportado, incluidos mensajes privados reportados, solo para revisarlo.</li>
        </ul>
      </section>

      <section>
        <h2>7. Proveedores que nos ayudan</h2>
        <p>Trabajamos con encargados del tratamiento que solo procesan datos siguiendo nuestras instrucciones:</p>
        <ul>
          <li>Supabase Inc.: base de datos, autenticación y archivos. Los datos se alojan en servidores de la Unión Europea (Irlanda).</li>
          <li>Vercel Inc.: alojamiento de la aplicación web.</li>
          <li>[●] Proveedor de envío de emails.</li>
        </ul>
        <p className="mt-2">
          Algunas de estas empresas tienen sede en EE. UU. Cuando haya transferencias internacionales, se amparan en
          [●] (Marco de Privacidad de Datos UE-EE. UU. y/o cláusulas contractuales tipo de la Comisión Europea).
        </p>
      </section>

      <section>
        <h2>8. Cuánto tiempo los guardamos</h2>
        <ul>
          <li>Mientras tengas cuenta. Si la borras, eliminamos tu perfil, publicaciones, comentarios, planes, mensajes, fotos y audios.</li>
          <li>Si borras un mensaje que alguien había reportado, guardamos una copia solo para moderación durante [●] meses. Los reportes se conservan [●] meses por seguridad de la comunidad.</li>
          <li>Las copias de seguridad de nuestros proveedores se eliminan según sus ciclos ([●] días).</li>
        </ul>
      </section>

      <section>
        <h2>9. Tus derechos</h2>
        <p>
          Puedes acceder a tus datos, corregirlos, borrarlos, oponerte, limitar su uso, pedir una copia
          (portabilidad) y retirar tu consentimiento. Puedes editar tu perfil y <strong>borrar tu cuenta</strong> en
          cualquier momento desde la app. Para todo lo demás escríbenos a [●]; te responderemos en un máximo de un
          mes. Si no estás de acuerdo con nuestra respuesta, puedes reclamar ante la Agencia Española de Protección
          de Datos (www.aepd.es).
        </p>
      </section>

      <section>
        <h2>10. Solo para mayores de edad</h2>
        <p>{brand.name} es solo para personas de 18 años o más. Si detectamos una cuenta de un menor, la eliminaremos.</p>
      </section>

      <section>
        <h2>11. Seguridad</h2>
        <p>
          Las conexiones van cifradas, cada permiso se comprueba en la propia base de datos (no solo en la app) y
          limitamos el acceso del equipo al mínimo. Ningún sistema es infalible: si ocurriera una brecha que afecte a
          tus datos, te avisaríamos y lo comunicaríamos a la AEPD cuando la ley lo exija.
        </p>
      </section>

      <section>
        <h2>12. Cambios</h2>
        <p>Si cambiamos esta política de forma importante, te avisaremos en la app antes de que entre en vigor.</p>
      </section>
    </LegalShell>
  )
}

export function TermsPage() {
  return (
    <LegalShell title="Condiciones de uso">
      <section>
        <h2>1. Qué es {brand.name}</h2>
        <p>
          {brand.name} es una red social para que adultos que viven con diabetes tipo 1 se conozcan, hagan planes y
          compartan experiencias. Lo ofrece [●] (razón social, NIF [●], dirección [●]). Al crear una cuenta
          aceptas estas condiciones y las{' '}
          <Link to="/legal/normas" className="font-semibold text-primary-text underline-offset-2 hover:underline">
            Normas de la comunidad
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>2. No es un servicio médico</h2>
        <p>
          Nada de lo que se publica en {brand.name} es consejo médico, diagnóstico ni tratamiento. Lo que compartan
          otras personas es su experiencia, no una recomendación para ti. Consulta siempre a tu equipo médico antes de
          cambiar nada de tu tratamiento. <strong>Ante una emergencia, llama al 112.</strong>
        </p>
      </section>

      <section>
        <h2>3. Quién puede usarlo</h2>
        <ul>
          <li>Personas de 18 años o más.</li>
          <li>Una cuenta por persona, con datos veraces. No se permite suplantar a nadie.</li>
          <li>Eres responsable de mantener segura tu contraseña.</li>
        </ul>
      </section>

      <section>
        <h2>4. Tu contenido</h2>
        <p>
          Lo que publicas sigue siendo tuyo. Nos das permiso, gratuito y limitado, para guardarlo y mostrarlo a otros
          miembros dentro de {brand.name}, solo para que el servicio funcione. El permiso termina cuando lo borras o
          borras tu cuenta. Eres responsable de lo que compartes y de tener derecho a compartirlo (por ejemplo, fotos
          en las que aparecen otras personas).
        </p>
      </section>

      <section>
        <h2>5. Planes y quedadas</h2>
        <p>
          {brand.name} te ayuda a encontrar planes, pero no los organiza ni los supervisa. Cada persona decide a qué
          plan va y es responsable de su seguridad. Te recomendamos quedar en lugares públicos, avisar a alguien de
          confianza y seguir los consejos de las Normas de la comunidad.
        </p>
      </section>

      <section>
        <h2>6. Moderación</h2>
        <p>
          Podemos ocultar o eliminar contenido y suspender cuentas que incumplan estas condiciones o las Normas de la
          comunidad, sobre todo tras recibir reportes. Si crees que nos hemos equivocado, escríbenos a [●].
        </p>
      </section>

      <section>
        <h2>7. Precio</h2>
        <p>{brand.name} es gratuito. Si algún día hubiera funciones de pago, te lo diríamos antes y serían opcionales.</p>
      </section>

      <section>
        <h2>8. Baja</h2>
        <p>Puedes borrar tu cuenta cuando quieras desde Ajustes. Se eliminarán tus datos como explica la Política de privacidad.</p>
      </section>

      <section>
        <h2>9. Responsabilidad</h2>
        <p>
          Trabajamos para que {brand.name} funcione bien y sea seguro, pero no podemos garantizar que esté siempre
          disponible ni sin errores, ni responder de lo que publiquen o hagan otros miembros, salvo en los casos en
          que la ley no permita limitar esa responsabilidad.
        </p>
      </section>

      <section>
        <h2>10. Cambios y ley aplicable</h2>
        <p>
          Si cambiamos estas condiciones de forma importante, te avisaremos con antelación. Se rigen por la ley
          española; los tribunales competentes serán los que correspondan según la normativa de consumidores. [●]
        </p>
      </section>
    </LegalShell>
  )
}

/**
 * Crisis help. Public (no account needed) and linked from the landing, settings, guidelines,
 * group chats and the "is in danger" report reason. We are not an emergency service — this page
 * only points people to the ones that are.
 */
export function HelpPage() {
  return (
    <LegalShell title="¿Necesitas ayuda ahora?" draft={false}>
      <section className="space-y-3">
        <a
          href="tel:112"
          className="flex items-center gap-4 rounded-card border-2 border-danger/40 bg-danger-soft p-5 transition active:scale-[0.99]"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-danger text-2xl font-extrabold text-white">
            112
          </span>
          <span>
            <span className="block text-lg font-bold text-danger">Emergencias: llama al 112</span>
            <span className="block text-[15px] text-text">
              Si tú u otra persona estáis en peligro, o hay una emergencia médica (por ejemplo, una hipoglucemia grave).
            </span>
          </span>
        </a>
        <a href="tel:024" className="flex items-center gap-4 rounded-card border border-border bg-surface p-5 transition active:scale-[0.99]">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-extrabold text-white">
            024
          </span>
          <span>
            <span className="block text-lg font-bold">Si piensas en hacerte daño: 024</span>
            <span className="block text-[15px] text-muted">Línea de atención a la conducta suicida en España. Gratuita y confidencial.</span>
          </span>
        </a>
        <p>Si estás fuera de España, llama al número de emergencias de tu país.</p>
      </section>

      <section>
        <h2>Lo que {brand.name} puede y no puede hacer</h2>
        <p>
          Aquí encontrarás personas que te escuchan y te entienden, pero <strong>no somos un servicio de emergencias ni de
          atención psicológica</strong>, y nadie vigila los mensajes en tiempo real. Para tu salud, tu equipo médico es
          siempre la referencia.
        </p>
      </section>

      <section>
        <h2>Si ves a alguien en peligro en la comunidad</h2>
        <p>
          Si hay riesgo inmediato, llama al 112. Después, usa «Reportar» y elige «Parece estar en peligro»: lo revisamos
          con la máxima prioridad.
        </p>
      </section>
    </LegalShell>
  )
}

const rules: Array<{ emoji: string; title: string; text: ReactNode }> = [
  { emoji: '💙', title: 'Trata a los demás como te gustaría que te trataran', text: 'Aquí cada persona vive la T1 a su manera. Nada de insultos, burlas, acoso ni discriminación por ningún motivo.' },
  {
    emoji: '🩺',
    title: 'Experiencias sí, consejos médicos no',
    text: (
      <>
        Cuenta lo que a ti te funciona, pero no digas a nadie qué dosis ponerse ni que cambie su tratamiento. Ante la
        duda: «habla con tu equipo médico». <strong>Si alguien está en peligro, llama al 112</strong>: esto no es un
        servicio de emergencias.
      </>
    ),
  },
  { emoji: '🔒', title: 'Cuida la privacidad de todos', text: 'No compartas datos, fotos ni capturas de conversaciones de otras personas sin su permiso. No publiques direcciones ni ubicaciones exactas.' },
  { emoji: '🤝', title: 'Quedadas seguras', text: 'Queda en sitios públicos, avisa a alguien de confianza y ve a tu ritmo. Nadie debe sentirse presionado a ir, quedarse o compartir más de lo que quiere.' },
  { emoji: '🚫', title: 'Nada de ventas ni spam', text: 'Está prohibido vender, comprar o intercambiar medicamentos, insulina, sensores o material sanitario. Tampoco se permite publicidad, cadenas ni enlaces sospechosos.' },
  { emoji: '🙈', title: 'Contenido apropiado', text: 'Nada sexual, violento, de odio ni ilegal. Tampoco contenido que anime a hacerse daño o a abandonar un tratamiento.' },
  { emoji: '🧑', title: 'Solo adultos y siendo tú', text: 'La comunidad es para mayores de 18 años. Una cuenta por persona y sin hacerse pasar por nadie.' },
  { emoji: '🚩', title: 'Si algo va mal, dínoslo', text: 'Usa «Reportar» en el perfil, la publicación, el plan o el mensaje, o bloquea a quien te moleste. Los reportes son confidenciales.' },
]

export function GuidelinesPage() {
  return (
    <LegalShell title="Normas de la comunidad" draft={false}>
      <section>
        <p>
          {brand.name} existe para que nadie viva la diabetes tipo 1 sintiéndose solo. Estas normas son cortas y
          sirven para que sea un sitio seguro y acogedor para todos.
        </p>
      </section>
      <ol className="space-y-4">
        {rules.map((r, i) => (
          <li key={r.title} className="flex gap-4 rounded-card border border-border bg-surface p-4">
            <span className="text-3xl" aria-hidden>
              {r.emoji}
            </span>
            <div>
              <h2 className="!mb-1 !text-base">
                {i + 1}. {r.title}
              </h2>
              <p className="text-[15px] leading-relaxed text-muted">{r.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <section>
        <h2>¿Necesitas ayuda urgente?</h2>
        <p>
          Esto no es un servicio de emergencias.{' '}
          <Link to="/ayuda" className="font-semibold text-primary-text underline-offset-2 hover:underline">
            Aquí tienes a quién llamar
          </Link>
          .
        </p>
      </section>
      <section>
        <h2>Qué pasa si no se cumplen</h2>
        <p>
          Según la gravedad, el equipo de moderación puede ocultar contenido, avisarte o suspender la cuenta. Las
          infracciones graves (acoso, venta de medicamentos, contenido sexual, menores de edad) suponen la suspensión
          inmediata. Si crees que nos hemos equivocado, escríbenos a [●].
        </p>
      </section>
    </LegalShell>
  )
}
