import { emptyQuestion, type DraftActivity } from "./logic";

export const DEMO_ACTIVITY: DraftActivity = {
  title: "Maria Leopoldina e a Independência",
  subject: "História · 8º ano",
  showRanking: true,
  questions: [
    {
      ...emptyQuestion(),
      text: "Quem participou das decisões políticas mencionadas no texto?",
      context:
        "Maria Leopoldina participou das decisões políticas que antecederam a Independência do Brasil. Enquanto D. Pedro viajava, ela presidiu reuniões e apoiou a separação política de Portugal.",
      options: ["Maria Leopoldina", "Tiradentes", "Princesa Isabel"],
      correct: 0,
      explanation: "O texto de apoio atribui essa atuação a Maria Leopoldina.",
    },
    {
      ...emptyQuestion(),
      text: "Qual processo histórico aparece no texto?",
      context: "",
      options: ["Proclamação da República", "Independência do Brasil", "Abolição da escravidão"],
      correct: 1,
      explanation: "O texto trata da separação política de Portugal, a Independência.",
    },
    {
      ...emptyQuestion(),
      text: "O que Leopoldina fez enquanto D. Pedro viajava?",
      context: "",
      options: [
        "Fundou Brasília",
        "Assinou a Lei Áurea",
        "Presidiu reuniões e apoiou a separação de Portugal",
      ],
      correct: 2,
      explanation: "Ela presidiu reuniões e apoiou a separação política de Portugal.",
    },
  ],
};
