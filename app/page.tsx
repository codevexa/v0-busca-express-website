import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Bike, Clock, Shield, Users, ArrowRight, Package, Zap } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-10 bg-primary rounded-lg flex items-center justify-center">
              <Bike className="size-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">BUSCAR EXPRESS</h1>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#servicos"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Serviços
            </a>
            <a
              href="#vantagens"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Vantagens
            </a>
            <a
              href="#contato"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Contato
            </a>
            <Button size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
              Seja um Cooperado
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="size-4 text-primary" />
            Entregas em tempo recorde
          </div>
          <h2 className="text-5xl md:text-7xl font-bold mb-6 text-balance">Velocidade e confiança em cada entrega</h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto text-pretty">
            Conectamos você aos melhores motoqueiros da cidade. Entregas rápidas, seguras e profissionais para o seu
            negócio.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8">
              Solicitar Entrega
              <ArrowRight className="ml-2 size-5" />
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 bg-transparent">
              Fale Conosco
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-muted/30">
        <div className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">500+</div>
              <div className="text-sm text-muted-foreground">Entregas por dia</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">150+</div>
              <div className="text-sm text-muted-foreground">Motoqueiros ativos</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">30min</div>
              <div className="text-sm text-muted-foreground">Tempo médio</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary mb-2">98%</div>
              <div className="text-sm text-muted-foreground">Satisfação</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicos" className="container mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl md:text-4xl font-bold mb-4">Nossos Serviços</h3>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Soluções completas de entrega para todos os tipos de negócios
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-2 hover:border-primary transition-colors">
            <CardContent className="p-6">
              <div className="size-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Package className="size-6 text-primary" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Entregas Express</h4>
              <p className="text-muted-foreground">Entregas urgentes em até 30 minutos dentro da cidade</p>
            </CardContent>
          </Card>
          <Card className="border-2 hover:border-primary transition-colors">
            <CardContent className="p-6">
              <div className="size-12 bg-secondary/50 rounded-lg flex items-center justify-center mb-4">
                <Clock className="size-6 text-secondary-foreground" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Entregas Programadas</h4>
              <p className="text-muted-foreground">Agende suas entregas com antecedência e otimize seu tempo</p>
            </CardContent>
          </Card>
          <Card className="border-2 hover:border-primary transition-colors">
            <CardContent className="p-6">
              <div className="size-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="size-6 text-primary" />
              </div>
              <h4 className="text-xl font-semibold mb-2">Entregas Seguras</h4>
              <p className="text-muted-foreground">Rastreamento em tempo real e seguro contra perdas e danos</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="vantagens" className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl md:text-4xl font-bold mb-6">Por que escolher a BUSCAR EXPRESS?</h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="size-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="size-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Rapidez garantida</h4>
                    <p className="text-muted-foreground">Entregas no menor tempo possível com rotas otimizadas</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="size-10 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                    <Users className="size-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Equipe profissional</h4>
                    <p className="text-muted-foreground">Motoqueiros treinados e comprometidos com a excelência</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="size-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                    <Shield className="size-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Segurança total</h4>
                    <p className="text-muted-foreground">
                      Seguro completo e rastreamento em tempo real de todas as entregas
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative aspect-square bg-muted rounded-2xl overflow-hidden">
              <img
                src="/motoqueiro-profissional-com-uniforme-amarelo-e-azu.jpg"
                alt="Motoqueiro da BUSCAR EXPRESS"
                className="object-cover w-full h-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contato" className="container mx-auto px-4 py-20">
        <Card className="bg-primary text-primary-foreground border-0">
          <CardContent className="p-12 text-center">
            <h3 className="text-3xl md:text-4xl font-bold mb-4">Pronto para começar?</h3>
            <p className="text-lg mb-8 text-primary-foreground/90 max-w-2xl mx-auto">
              Faça parte da nossa cooperativa ou solicite uma entrega agora mesmo
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="bg-background text-foreground hover:bg-background/90">
                Seja um Cooperado
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-transparent border-primary-foreground text-primary-foreground hover:bg-primary-foreground/10"
              >
                Solicitar Entrega
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="size-8 bg-primary rounded-lg flex items-center justify-center">
                  <Bike className="size-5 text-primary-foreground" />
                </div>
                <span className="font-bold">BUSCAR EXPRESS</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Cooperativa de motoqueiros comprometida com entregas rápidas e seguras.
              </p>
            </div>
            <div>
              <h5 className="font-semibold mb-3">Serviços</h5>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Entrega Express
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Entrega Programada
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Rastreamento
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-3">Cooperativa</h5>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Seja Cooperado
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Benefícios
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition-colors">
                    Como Funciona
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="font-semibold mb-3">Contato</h5>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>contato@buscarexpress.com</li>
                <li>(11) 99999-9999</li>
                <li>Seg - Sex: 8h às 18h</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
            © 2025 BUSCAR EXPRESS. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
