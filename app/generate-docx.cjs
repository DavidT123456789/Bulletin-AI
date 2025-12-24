const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = require('docx');
const fs = require('fs');

// Create the document
const doc = new Document({
    creator: "Bulletin AI",
    title: "Plan de Lancement & Évolution",
    description: "Document stratégique pour le déploiement de Bulletin AI",
    sections: [{
        properties: {},
        children: [
            // Title
            new Paragraph({
                text: "🚀 Bulletin AI — Plan de Lancement & Évolution",
                heading: HeadingLevel.TITLE,
                spacing: { after: 400 }
            }),

            // Vision
            new Paragraph({
                text: "Vision",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({
                        text: "Transformer Bulletin AI d'un outil saisonnier (bulletins) en ",
                        italics: true
                    }),
                    new TextRun({
                        text: "assistant pédagogique indispensable toute l'année",
                        bold: true,
                        italics: true
                    }),
                    new TextRun({ text: ".", italics: true })
                ],
                spacing: { after: 400 }
            }),

            // Phase 1
            new Paragraph({
                text: "Phase 1 : Lancement (Mois 1-2)",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
                text: "✅ Actions immédiates",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Action", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Détail", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Coût", bold: true })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Déployer l'app")] }),
                            new TableCell({ children: [new Paragraph("GitHub Pages ou Netlify")] }),
                            new TableCell({ children: [new Paragraph("Gratuit")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Nom de domaine")] }),
                            new TableCell({ children: [new Paragraph("bulletinai.fr")] }),
                            new TableCell({ children: [new Paragraph("~12€/an")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Landing page")] }),
                            new TableCell({ children: [new Paragraph("Page de présentation + démo")] }),
                            new TableCell({ children: [new Paragraph("Gratuit")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Licence")] }),
                            new TableCell({ children: [new Paragraph("CC BY-NC-SA 4.0")] }),
                            new TableCell({ children: [new Paragraph("Gratuit")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Donations")] }),
                            new TableCell({ children: [new Paragraph("Lien Ko-fi / Buy Me a Coffee")] }),
                            new TableCell({ children: [new Paragraph("Gratuit")] })
                        ]
                    })
                ]
            }),

            // Phase 2
            new Paragraph({
                text: "Phase 2 : Croissance (Mois 3-6)",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 600, after: 200 }
            }),
            new Paragraph({
                text: "🎯 Objectif : Usage toute l'année",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "2a. Gestion des classes (prérequis) ⭐",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 100 }
            }),
            new Paragraph({ text: "• Créer/supprimer une classe (\"6ème B\", \"CM2 Mme Dupont\")" }),
            new Paragraph({ text: "• Associer élèves à une classe lors de l'import" }),
            new Paragraph({ text: "• Filtrer par classe dans l'interface" }),
            new Paragraph({ text: "• Statistiques par classe (moyenne, répartition)" }),
            new Paragraph({ text: "• Archiver une classe en fin d'année", spacing: { after: 200 } }),

            new Paragraph({
                text: "2b. Nouvelles fonctionnalités",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 100 }
            }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Fonctionnalité", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Valeur ajoutée", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Fréquence", bold: true })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Suivi élève annuel")] }),
                            new TableCell({ children: [new Paragraph("Historique des appréciations")] }),
                            new TableCell({ children: [new Paragraph("Mensuel")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Commentaires rapides")] }),
                            new TableCell({ children: [new Paragraph("Cahiers, devoirs, comportement")] }),
                            new TableCell({ children: [new Paragraph("Quotidien")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Banque formulations")] }),
                            new TableCell({ children: [new Paragraph("Phrases types personnalisables")] }),
                            new TableCell({ children: [new Paragraph("Hebdo")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Export PDF bulletin")] }),
                            new TableCell({ children: [new Paragraph("Formaté prêt à imprimer")] }),
                            new TableCell({ children: [new Paragraph("Trimestriel")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Mode réunion parents")] }),
                            new TableCell({ children: [new Paragraph("Résumé élève pour entretien")] }),
                            new TableCell({ children: [new Paragraph("Bimensuel")] })
                        ]
                    })
                ]
            }),

            // Phase 3
            new Paragraph({
                text: "Phase 3 : Monétisation (Mois 6+)",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 600, after: 200 }
            }),
            new Paragraph({
                text: "💰 Modèle Freemium",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Version", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Prix", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Fonctionnalités", bold: true })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Gratuite")] }),
                            new TableCell({ children: [new Paragraph("0€")] }),
                            new TableCell({ children: [new Paragraph("30 générations/mois, 1 classe")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("Pro")] }),
                            new TableCell({ children: [new Paragraph("29€/an")] }),
                            new TableCell({ children: [new Paragraph("Illimité, multi-classes, historique")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("École")] }),
                            new TableCell({ children: [new Paragraph("99€/an")] }),
                            new TableCell({ children: [new Paragraph("10 comptes, stats établissement")] })
                        ]
                    })
                ]
            }),

            // Roadmap
            new Paragraph({
                text: "Roadmap Évolution Produit",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 600, after: 200 }
            }),
            new Paragraph({ text: "2025 Q1 : PWA + Lancement public, Landing page + Donations" }),
            new Paragraph({ text: "2025 Q2 : Gestion des classes ⭐, Suivi élève annuel, Commentaires rapides" }),
            new Paragraph({ text: "2025 Q3 : Version Pro (freemium), Export PDF structuré" }),
            new Paragraph({ text: "2025 Q4 : Mode réunion parents, Intégration Pronote (si API)" }),
            new Paragraph({ text: "2026 : Version équipe/établissement, Analytics pédagogiques IA", spacing: { after: 400 } }),

            // Marketing
            new Paragraph({
                text: "Marketing — Canaux gratuits",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({ text: "• Réseaux enseignants : Partage sur Facebook/forums profs" }),
            new Paragraph({ text: "• Twitter/X Éducation : Screenshots + témoignages" }),
            new Paragraph({ text: "• Bouche à oreille : Demander aux utilisateurs de partager" }),
            new Paragraph({ text: "• Product Hunt : Lancement officiel" }),
            new Paragraph({ text: "• Blog SEO : Articles \"Comment rédiger des appréciations\"", spacing: { after: 400 } }),

            // Summary
            new Paragraph({
                text: "Résumé Exécutif",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 }
            }),
            new Paragraph({ text: "🎯 Mission : Assistant pédagogique IA gratuit" }),
            new Paragraph({ text: "💰 Modèle : Freemium + donations" }),
            new Paragraph({ text: "🔒 Licence : CC BY-NC-SA 4.0" }),
            new Paragraph({ text: "📈 Évolution : Outil quotidien, pas saisonnier" }),
            new Paragraph({ text: "🌟 Image : Bienveillant, éthique, utile" })
        ]
    }]
});

// Generate and save
Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync('../Bulletin_AI_Plan_Lancement.docx', buffer);
    console.log('✅ Document créé: Bulletin_AI_Plan_Lancement.docx');
});
