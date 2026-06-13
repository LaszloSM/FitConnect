// Geografía Colombia-first: departamentos con sus municipios principales
// (capitales + municipios con población relevante para gimnasios).
// El CityCombobox permite texto libre, así que esta lista no necesita ser
// exhaustiva — solo cubrir la gran mayoría de casos con búsqueda rápida.

export interface Department {
  name: string;
  cities: string[];
}

export const COLOMBIA_DEPARTMENTS: Department[] = [
  { name: "Amazonas", cities: ["Leticia", "Puerto Nariño"] },
  { name: "Antioquia", cities: ["Medellín", "Bello", "Itagüí", "Envigado", "Apartadó", "Turbo", "Rionegro", "Sabaneta", "La Estrella", "Copacabana", "Caldas", "Girardota", "Caucasia", "Marinilla", "La Ceja", "Carmen de Viboral", "Santa Fe de Antioquia", "Puerto Berrío", "Yarumal", "Andes", "Urrao", "Necoclí", "Chigorodó", "Carepa"] },
  { name: "Arauca", cities: ["Arauca", "Saravena", "Tame", "Arauquita", "Fortul"] },
  { name: "Atlántico", cities: ["Barranquilla", "Soledad", "Malambo", "Sabanalarga", "Puerto Colombia", "Galapa", "Baranoa", "Sabanagrande", "Santo Tomás", "Palmar de Varela"] },
  { name: "Bogotá D.C.", cities: ["Bogotá"] },
  { name: "Bolívar", cities: ["Cartagena", "Magangué", "Turbaco", "Arjona", "El Carmen de Bolívar", "San Juan Nepomuceno", "Santa Rosa del Sur", "Mompós", "María la Baja"] },
  { name: "Boyacá", cities: ["Tunja", "Duitama", "Sogamoso", "Chiquinquirá", "Paipa", "Puerto Boyacá", "Villa de Leyva", "Moniquirá", "Garagoa", "Samacá", "Nobsa"] },
  { name: "Caldas", cities: ["Manizales", "La Dorada", "Chinchiná", "Villamaría", "Riosucio", "Anserma", "Manzanares", "Supía", "Neira"] },
  { name: "Caquetá", cities: ["Florencia", "San Vicente del Caguán", "Puerto Rico", "El Doncello", "Cartagena del Chairá"] },
  { name: "Casanare", cities: ["Yopal", "Aguazul", "Villanueva", "Paz de Ariporo", "Tauramena", "Monterrey"] },
  { name: "Cauca", cities: ["Popayán", "Santander de Quilichao", "Puerto Tejada", "Patía (El Bordo)", "Piendamó", "Corinto", "Miranda", "Guapi", "Cajibío"] },
  { name: "Cesar", cities: ["Valledupar", "Aguachica", "Agustín Codazzi", "Bosconia", "La Jagua de Ibirico", "Curumaní", "Chimichagua", "El Copey", "San Alberto"] },
  { name: "Chocó", cities: ["Quibdó", "Istmina", "Tadó", "Condoto", "Riosucio (Chocó)", "Acandí", "Bahía Solano"] },
  { name: "Córdoba", cities: ["Montería", "Cereté", "Sahagún", "Lorica", "Montelíbano", "Planeta Rica", "Tierralta", "Ciénaga de Oro", "San Pelayo", "Ayapel"] },
  { name: "Cundinamarca", cities: ["Soacha", "Zipaquirá", "Facatativá", "Chía", "Fusagasugá", "Girardot", "Mosquera", "Funza", "Madrid", "Cajicá", "Cota", "La Calera", "Sibaté", "Tocancipá", "Sopó", "Ubaté", "Villeta", "Pacho", "Tabio", "Tenjo", "El Rosal", "La Mesa", "Anapoima", "Cáqueza", "Gachancipá"] },
  { name: "Guainía", cities: ["Inírida"] },
  { name: "Guaviare", cities: ["San José del Guaviare", "El Retorno", "Calamar"] },
  { name: "Huila", cities: ["Neiva", "Pitalito", "Garzón", "La Plata", "Campoalegre", "San Agustín", "Gigante", "Palermo", "Rivera"] },
  { name: "La Guajira", cities: ["Riohacha", "Maicao", "Uribia", "Manaure", "San Juan del Cesar", "Villanueva (La Guajira)", "Fonseca", "Barrancas", "Dibulla", "Albania", "Hatonuevo", "Distracción", "El Molino", "Urumita", "La Jagua del Pilar", "Mingueo"] },
  { name: "Magdalena", cities: ["Santa Marta", "Ciénaga", "Fundación", "Aracataca", "El Banco", "Plato", "Zona Bananera", "Pivijay", "Sitionuevo"] },
  { name: "Meta", cities: ["Villavicencio", "Acacías", "Granada", "Puerto López", "La Macarena", "Cumaral", "San Martín", "Restrepo", "Puerto Gaitán"] },
  { name: "Nariño", cities: ["Pasto", "Tumaco", "Ipiales", "Túquerres", "Samaniego", "La Unión (Nariño)", "Sandoná", "Buesaco"] },
  { name: "Norte de Santander", cities: ["Cúcuta", "Ocaña", "Villa del Rosario", "Los Patios", "Pamplona", "Tibú", "El Zulia", "Ábrego", "Chinácota"] },
  { name: "Putumayo", cities: ["Mocoa", "Puerto Asís", "Orito", "Valle del Guamuez", "Villagarzón", "Sibundoy"] },
  { name: "Quindío", cities: ["Armenia", "Calarcá", "Montenegro", "La Tebaida", "Quimbaya", "Circasia", "Filandia", "Salento"] },
  { name: "Risaralda", cities: ["Pereira", "Dosquebradas", "Santa Rosa de Cabal", "La Virginia", "Belén de Umbría", "Quinchía", "Marsella"] },
  { name: "San Andrés y Providencia", cities: ["San Andrés", "Providencia"] },
  { name: "Santander", cities: ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja", "San Gil", "Socorro", "Barbosa (Santander)", "Vélez", "Lebrija", "Sabana de Torres", "Puerto Wilches", "Zapatoca", "Charalá"] },
  { name: "Sucre", cities: ["Sincelejo", "Corozal", "San Marcos", "Sampués", "Tolú", "San Onofre", "Ovejas", "Sincé"] },
  { name: "Tolima", cities: ["Ibagué", "Espinal", "Melgar", "Honda", "Líbano", "Chaparral", "Mariquita", "Flandes", "Purificación", "Guamo", "Fresno"] },
  { name: "Valle del Cauca", cities: ["Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago", "Buga", "Jamundí", "Yumbo", "Candelaria", "Florida", "Pradera", "Sevilla", "Zarzal", "Roldanillo", "Caicedonia", "La Unión (Valle)", "Dagua"] },
  { name: "Vaupés", cities: ["Mitú"] },
  { name: "Vichada", cities: ["Puerto Carreño", "La Primavera", "Cumaribo"] },
];

export interface CityOption {
  city: string;
  department: string;
}

export const COLOMBIA_CITIES: CityOption[] = COLOMBIA_DEPARTMENTS.flatMap((d) =>
  d.cities.map((city) => ({ city, department: d.name }))
);

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "CO", name: "Colombia", flag: "🇨🇴" },
  { code: "MX", name: "México", flag: "🇲🇽" },
  { code: "AR", name: "Argentina", flag: "🇦🇷" },
  { code: "PE", name: "Perú", flag: "🇵🇪" },
  { code: "CL", name: "Chile", flag: "🇨🇱" },
  { code: "EC", name: "Ecuador", flag: "🇪🇨" },
  { code: "VE", name: "Venezuela", flag: "🇻🇪" },
  { code: "PA", name: "Panamá", flag: "🇵🇦" },
  { code: "CR", name: "Costa Rica", flag: "🇨🇷" },
  { code: "DO", name: "República Dominicana", flag: "🇩🇴" },
  { code: "GT", name: "Guatemala", flag: "🇬🇹" },
  { code: "HN", name: "Honduras", flag: "🇭🇳" },
  { code: "SV", name: "El Salvador", flag: "🇸🇻" },
  { code: "NI", name: "Nicaragua", flag: "🇳🇮" },
  { code: "BO", name: "Bolivia", flag: "🇧🇴" },
  { code: "PY", name: "Paraguay", flag: "🇵🇾" },
  { code: "UY", name: "Uruguay", flag: "🇺🇾" },
  { code: "BR", name: "Brasil", flag: "🇧🇷" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸" },
  { code: "ES", name: "España", flag: "🇪🇸" },
];

export const DEFAULT_COUNTRY = "CO";
