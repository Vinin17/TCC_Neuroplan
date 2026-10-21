/* =========================================================
   NEUROPLAN · script.js
   Todas as páginas carregam este arquivo. Cada bloco "iniciar..."
   só roda se encontrar os elementos da sua tela.
   - UMA lista de tarefas (localStorage) usada por Hoje, Rotina e Usuário.
   - Nova tarefa cria/edita/exclui nessa lista.
   - Cuidados e Configurações mudam o comportamento do app.
   - Login (questionário) preenche perfil, cuidados e preferências.
   Os dados ficam só neste aparelho (localStorage).
   ========================================================= */
(function () {
  "use strict";

  const SEMEAR_EXEMPLOS = true; // true = primeira vez já vem com tarefas de exemplo

  const CHAVES = {
    tarefas: "neuroplan:tarefas",
    concluidas: "neuroplan:concluidas",
    cuidados: "neuroplan:cuidados",
    perfil: "neuroplan:perfil",
    aviso: "neuroplan:aviso",
  };

  const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const DIAS_CURTOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const CATEGORIAS = { aula: "Aula", afazeres: "Afazeres", saude: "Saúde", lazer: "Lazer" };
  const ICONE_RELOGIO = '<svg class="icone icone--mini" aria-hidden="true"><use href="#i-clock"/></svg>';
  const ICONE_LAPIS = '<svg class="icone" aria-hidden="true"><use href="#i-pencil"/></svg>';

  /* ---------- Utilitários ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function ler(chave, padrao) {
    try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v); }
    catch (e) { return padrao; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ }
  }
  const plural = (n, s, p) => (n === 1 ? s : p);

  // Preferências vindas do questionário (login)
  const _conta = ler("neuroplan:conta", null);
  const _resp = (_conta && _conta.respostas) || {};
  const FOCO = Number(_resp.tdah_foco) || 25;   // minutos de foco por sessão
  const PAUSA = Math.min(45, FOCO * 2);         // pausa a cada X minutos

  /* ----- Datas (AAAA-MM-DD, fuso do aparelho) ----- */
  const doisDigitos = (n) => String(n).padStart(2, "0");
  const paraISO = (d) => d.getFullYear() + "-" + doisDigitos(d.getMonth() + 1) + "-" + doisDigitos(d.getDate());
  function deISO(iso) { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }
  function somarDias(iso, q) { const d = deISO(iso); d.setDate(d.getDate() + q); return paraISO(d); }
  const hojeISO = () => paraISO(new Date());
  const ehISO = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t || "");

  /* ----- Horas ----- */
  function minutos(h) { if (!h) return null; const [a, b] = h.split(":").map(Number); return a * 60 + b; }
  function horaCurta(h) { if (!h) return ""; const [a, b] = h.split(":"); return Number(a) + ":" + b; }
  function duracao(t) { const i = minutos(t.inicio), f = minutos(t.fim); return i !== null && f !== null ? f - i : 0; }

  /* ----- Avisos rápidos ----- */
  function mostrarAviso(texto) {
    const el = document.createElement("div");
    el.className = "aviso"; el.setAttribute("role", "status"); el.textContent = texto;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visivel"));
    setTimeout(() => { el.classList.remove("is-visivel"); setTimeout(() => el.remove(), 300); }, 2600);
  }
  function avisarNaProximaPagina(texto) { try { sessionStorage.setItem(CHAVES.aviso, texto); } catch (e) { /* ignora */ } }
  function mostrarAvisoPendente() {
    try {
      const t = sessionStorage.getItem(CHAVES.aviso);
      if (t) { sessionStorage.removeItem(CHAVES.aviso); mostrarAviso(t); }
    } catch (e) { /* ignora */ }
  }

  /* =========================================================
     DADOS: tarefas, conclusões e cuidados
     Tarefa = { id, nome, categoria, inicio, fim, avisar, descricao, data, repetir, importante }
     ========================================================= */
  function normalizar(t) {
    return {
      id: t.id || "t" + Date.now() + Math.random().toString(36).slice(2, 6),
      nome: String(t.nome || "Tarefa"),
      categoria: CATEGORIAS[t.categoria] ? t.categoria : "aula",
      inicio: t.inicio || "", fim: t.fim || "",
      avisar: t.avisar !== false,
      descricao: t.descricao || "",
      data: ehISO(t.data) ? t.data : hojeISO(),
      repetir: Boolean(t.repetir), importante: Boolean(t.importante),
    };
  }
  function exemplos() {
    const hoje = hojeISO(), amanha = somarDias(hoje, 1);
    return [
      { id: "ex1", nome: "Revisar biologia", categoria: "aula", inicio: "09:00", fim: "10:00", data: hoje, repetir: true, importante: true },
      { id: "ex2", nome: "Arrumar o quarto", categoria: "afazeres", inicio: "11:00", fim: "11:30", data: hoje },
      { id: "ex3", nome: "Academia", categoria: "saude", inicio: "16:00", fim: "17:00", data: hoje },
      { id: "ex4", nome: "Revisar Matemática", categoria: "aula", inicio: "19:00", fim: "20:00", data: hoje, repetir: true },
      { id: "ex5", nome: "Entregar trabalho de história", categoria: "aula", inicio: "10:00", fim: "10:30", data: amanha },
    ];
  }
  function carregarTarefas() {
    let lista = ler(CHAVES.tarefas, null);
    if (lista === null) { lista = SEMEAR_EXEMPLOS ? exemplos() : []; guardar(CHAVES.tarefas, lista); }
    const precisa = lista.some((t) => !ehISO(t.data));
    const norm = lista.map(normalizar);
    if (precisa) guardar(CHAVES.tarefas, norm);
    return norm;
  }
  const salvarTarefas = (l) => guardar(CHAVES.tarefas, l);

  function ocorreEm(t, iso) {
    if (t.data === iso) return true;
    return t.repetir && iso > t.data && deISO(iso).getDay() === deISO(t.data).getDay();
  }
  function ordenar(a, b, prioridade) {
    if (prioridade && a.importante !== b.importante) return a.importante ? -1 : 1;
    const ma = minutos(a.inicio), mb = minutos(b.inicio);
    return (ma === null ? 1e9 : ma) - (mb === null ? 1e9 : mb) || a.nome.localeCompare(b.nome, "pt-BR");
  }
  const tarefasDoDia = (iso, todas, p) => todas.filter((t) => ocorreEm(t, iso)).sort((a, b) => ordenar(a, b, p));

  const chaveConclusao = (t, iso) => t.id + "|" + iso;
  const carregarConcluidas = () => new Set(ler(CHAVES.concluidas, []));
  const salvarConcluidas = (c) => guardar(CHAVES.concluidas, Array.from(c));
  const carregarCuidados = () => ler(CHAVES.cuidados, {});

  /* =========================================================
     ITEM DE TAREFA (Hoje e Rotina)
     ========================================================= */
  function criarItemTarefa(tarefa, iso, concluidas, cuidados, opcoes) {
    const mostrarData = Boolean(opcoes && opcoes.mostrarData);
    const destaque = Boolean(cuidados.prioridade && tarefa.importante);

    const li = document.createElement("li");
    li.className = "tarefa tarefa--" + tarefa.categoria + (destaque ? " tarefa--importante" : "");
    li.dataset.id = tarefa.id; li.dataset.data = iso;

    const rotulo = document.createElement("label");
    rotulo.className = "tarefa__principal";
    const check = document.createElement("input");
    check.type = "checkbox"; check.className = "tarefa__check";
    check.checked = concluidas.has(chaveConclusao(tarefa, iso));

    const texto = document.createElement("span"); texto.className = "tarefa__texto";
    const titulo = document.createElement("span"); titulo.className = "tarefa__titulo"; titulo.textContent = tarefa.nome;

    const partes = [];
    if (mostrarData) { const d = deISO(iso); partes.push(DIAS_CURTOS[d.getDay()].slice(0, 3) + ", " + d.getDate()); }
    partes.push(horaCurta(tarefa.inicio) || "Sem hora");
    partes.push(CATEGORIAS[tarefa.categoria]);
    const total = duracao(tarefa);
    if (cuidados["sessoes-curtas"] && total > FOCO) partes.push(Math.ceil(total / FOCO) + " sessões de " + FOCO + " min");
    if (cuidados.pausas && total > PAUSA) partes.push("pausa a cada " + PAUSA + " min");
    if (destaque) partes.push("Importante");
    if (tarefa.repetir) partes.push("Toda semana");

    const meta = document.createElement("span"); meta.className = "tarefa__meta";
    meta.insertAdjacentHTML("beforeend", ICONE_RELOGIO);
    partes.forEach((parte, i) => {
      if (i > 0) { const p = document.createElement("span"); p.setAttribute("aria-hidden", "true"); p.textContent = "•"; meta.appendChild(p); }
      const s = document.createElement("span"); s.textContent = parte; meta.appendChild(s);
    });

    texto.append(titulo, meta);
    rotulo.append(check, texto);

    const editar = document.createElement("a");
    editar.className = "tarefa__editar";
    editar.href = "nova-tarefa.html?editar=" + encodeURIComponent(tarefa.id);
    editar.setAttribute("aria-label", "Editar " + tarefa.nome);
    editar.insertAdjacentHTML("beforeend", ICONE_LAPIS);

    li.append(rotulo, editar);
    return li;
  }

  function ligarChecks(lista, aoMudar) {
    lista.addEventListener("change", (e) => {
      if (!e.target.classList.contains("tarefa__check")) return;
      const li = e.target.closest(".tarefa");
      const chave = li.dataset.id + "|" + li.dataset.data;
      const c = carregarConcluidas();
      if (e.target.checked) c.add(chave); else c.delete(chave);
      salvarConcluidas(c);
      if (aoMudar) aoMudar(li.dataset.id, li.dataset.data);
    });
  }
  function devolverFoco(id, iso) {
    const alvo = $('.tarefa[data-id="' + id + '"][data-data="' + iso + '"] .tarefa__check');
    if (alvo) alvo.focus();
  }

  /* ---------- Todas as páginas ---------- */
  function aplicarCuidados() {
    document.body.classList.toggle("modo-calmo", Boolean(carregarCuidados()["modo-calmo"]));
  }
  function atualizarAvatares() {
    const perfil = ler(CHAVES.perfil, null);
    const nome = perfil && perfil.nome ? perfil.nome.trim() : "";
    if (!nome) return;
    $$(".avatar").forEach((el) => { el.textContent = nome.charAt(0).toUpperCase(); });
  }

  /* =========================================================
     HOJE
     ========================================================= */
  function iniciarHoje() {
    const listaHoje = $("#lista-hoje");
    if (!listaHoje) return;
    const listaRecuperar = $("#lista-recuperacao");
    const blocoRecuperar = $("#bloco-recuperacao");
    const semana = $("#semana");
    const apoio = $(".titulo-tela__apoio");
    const faixaProxima = $("#proxima");
    const iso = hojeISO();

    const agora = new Date();
    $("#hoje-titulo").textContent = DIAS[agora.getDay()] + ", " + agora.getDate() + " de " + MESES[agora.getMonth()];

    function desenhar() {
      const todas = carregarTarefas(), concluidas = carregarConcluidas(), cuidados = carregarCuidados();
      const prioridade = Boolean(cuidados.prioridade);

      const doDia = tarefasDoDia(iso, todas, prioridade);
      listaHoje.textContent = "";
      doDia.forEach((t) => listaHoje.appendChild(criarItemTarefa(t, iso, concluidas, cuidados)));
      $("#vazio-hoje").hidden = doDia.length > 0;

      const feitas = doDia.filter((t) => concluidas.has(chaveConclusao(t, iso))).length;
      if (doDia.length === 0) apoio.textContent = "Dia livre. Aproveite para descansar ou planejar algo.";
      else if (feitas === doDia.length) apoio.textContent = "Tudo feito por hoje. Você merece uma pausa.";
      else apoio.textContent = "Você tem " + doDia.length + " " + plural(doDia.length, "tarefa planejada", "tarefas planejadas") + ". Comece pela mais leve.";

      listaRecuperar.textContent = "";
      let pendentes = 0;
      if (cuidados.recuperacao) {
        for (let i = 1; i <= 7; i++) {
          const dia = somarDias(iso, -i);
          tarefasDoDia(dia, todas, prioridade).forEach((t) => {
            if (concluidas.has(chaveConclusao(t, dia))) return;
            listaRecuperar.appendChild(criarItemTarefa(t, dia, concluidas, cuidados, { mostrarData: true }));
            pendentes++;
          });
        }
      }
      blocoRecuperar.hidden = pendentes === 0;

      semana.textContent = "";
      for (let i = 0; i < 7; i++) {
        const dia = somarDias(iso, i);
        const td = tarefasDoDia(dia, todas, prioridade);
        const fd = td.filter((t) => concluidas.has(chaveConclusao(t, dia))).length;

        const item = document.createElement("li"); item.className = "semana__item";
        const cartao = document.createElement("a");
        cartao.className = "semana__dia" + (i === 0 ? " is-hoje" : "");
        cartao.href = "rotina.html?data=" + dia;
        const nome = document.createElement("h3"); nome.className = "semana__nome"; nome.textContent = DIAS_CURTOS[deISO(dia).getDay()];
        const qtd = document.createElement("p"); qtd.className = "semana__qtd"; qtd.textContent = td.length + " " + plural(td.length, "tarefa", "tarefas");
        const bol = document.createElement("div"); bol.className = "semana__bolinhas";
        bol.setAttribute("aria-label", fd + " de " + td.length + " " + plural(td.length, "tarefa concluída", "tarefas concluídas"));
        td.slice(0, 8).forEach((t) => {
          const b = document.createElement("span");
          b.className = "bolinha" + (concluidas.has(chaveConclusao(t, dia)) ? " is-feita" : "");
          bol.appendChild(b);
        });
        cartao.append(nome, qtd, bol); item.appendChild(cartao); semana.appendChild(item);
      }
      atualizarProxima(doDia, concluidas, cuidados);
    }

    function atualizarProxima(doDia, concluidas, cuidados) {
      if (!cuidados.previsibilidade) { faixaProxima.hidden = true; return; }
      const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
      const proxima = doDia.find((t) => {
        const i = minutos(t.inicio);
        return i !== null && i >= agoraMin && !concluidas.has(chaveConclusao(t, iso));
      });
      if (!proxima) { faixaProxima.hidden = true; return; }
      const falta = minutos(proxima.inicio) - agoraMin;
      let quando = "agora";
      if (falta > 0) quando = "em " + (falta >= 60 ? Math.floor(falta / 60) + " h" + (falta % 60 ? " " + (falta % 60) + " min" : "") : falta + " min");
      faixaProxima.textContent = "Próxima: " + proxima.nome + " às " + horaCurta(proxima.inicio) + " (" + quando + ")";
      faixaProxima.hidden = false;
    }

    const aoMudar = (id, dia) => { desenhar(); devolverFoco(id, dia); };
    ligarChecks(listaHoje, aoMudar);
    ligarChecks(listaRecuperar, aoMudar);
    desenhar();
    setInterval(desenhar, 60000);
    mostrarAvisoPendente();
  }

  /* =========================================================
     NOVA TAREFA: criar, editar e excluir
     ========================================================= */
  function iniciarNovaTarefa() {
    const form = $("#form-tarefa");
    if (!form) return;
    const params = new URLSearchParams(window.location.search);
    const todas = carregarTarefas();
    const existente = todas.find((t) => t.id === params.get("editar")) || null;

    const campoNome = $("#tarefa-nome"), campoInicio = $("#hora-inicio"), campoFim = $("#hora-fim");
    const campoData = $("#tarefa-data"), textoData = $("#data-texto");

    function rotuloData(iso) {
      if (iso === hojeISO()) return "Hoje";
      if (iso === somarDias(hojeISO(), 1)) return "Amanhã";
      const d = deISO(iso);
      return DIAS_CURTOS[d.getDay()].slice(0, 3) + ", " + d.getDate() + "/" + doisDigitos(d.getMonth() + 1);
    }
    const dataInicial = existente ? existente.data : (ehISO(params.get("data")) ? params.get("data") : hojeISO());
    campoData.value = dataInicial;
    textoData.textContent = rotuloData(dataInicial);
    campoData.addEventListener("change", () => {
      if (!campoData.value) campoData.value = hojeISO();
      textoData.textContent = rotuloData(campoData.value);
    });

    if (existente) {
      campoNome.value = existente.nome;
      form.elements.categoria.value = existente.categoria;
      campoInicio.value = existente.inicio; campoFim.value = existente.fim;
      form.elements.aviso.checked = existente.avisar;
      form.elements.repetir.checked = existente.repetir;
      form.elements.importante.checked = existente.importante;
      form.elements.descricao.value = existente.descricao;
      $("#nova-rotulo").textContent = "Editar";
      $("#nova-titulo").textContent = "Editar tarefa";
      $("#btn-salvar").textContent = "Salvar alterações";
      $("#btn-excluir").hidden = false;
      document.title = "Editar tarefa · NeuroPlan";
    }

    const destinoApos = (iso) => (iso === hojeISO() ? "index.html" : "rotina.html?data=" + iso);

    function limparErros() {
      $$(".campo__erro", form).forEach((el) => el.remove());
      $$("[aria-invalid]", form).forEach((el) => { el.removeAttribute("aria-invalid"); el.removeAttribute("aria-describedby"); });
    }
    function mostrarErro(campo, msg, id) {
      const e = document.createElement("p");
      e.className = "campo__erro"; e.id = id; e.setAttribute("role", "alert"); e.textContent = msg;
      (campo.closest(".campo") || campo.parentElement).appendChild(e);
      campo.setAttribute("aria-invalid", "true"); campo.setAttribute("aria-describedby", id);
    }

    form.addEventListener("submit", (ev) => {
      ev.preventDefault(); limparErros();
      const nome = campoNome.value.trim();
      let primeiro = null;
      if (!nome) { mostrarErro(campoNome, "Dê um nome para a tarefa.", "erro-nome"); primeiro = campoNome; }
      if (campoInicio.value && campoFim.value && campoFim.value <= campoInicio.value) {
        mostrarErro(campoFim, "O horário final precisa ser depois do inicial.", "erro-horario");
        primeiro = primeiro || campoFim;
      }
      if (primeiro) { primeiro.focus(); return; }

      const tarefa = normalizar({
        id: existente ? existente.id : undefined, nome, categoria: form.elements.categoria.value,
        inicio: campoInicio.value, fim: campoFim.value, avisar: form.elements.aviso.checked,
        descricao: form.elements.descricao.value.trim(), data: campoData.value,
        repetir: form.elements.repetir.checked, importante: form.elements.importante.checked,
      });
      salvarTarefas(existente ? todas.map((t) => (t.id === existente.id ? tarefa : t)) : todas.concat(tarefa));
      avisarNaProximaPagina(existente ? "Alterações salvas" : "Tarefa salva");
      window.location.href = destinoApos(tarefa.data);
    });

    $("#btn-excluir").addEventListener("click", () => {
      if (!existente) return;
      if (!window.confirm('Excluir "' + existente.nome + '"?' + (existente.repetir ? "\nIsso remove todas as repetições semanais." : ""))) return;
      salvarTarefas(todas.filter((t) => t.id !== existente.id));
      avisarNaProximaPagina("Tarefa excluída");
      window.location.href = destinoApos(existente.data);
    });
    campoNome.addEventListener("input", limparErros);
  }

  /* =========================================================
     ROTINA: calendário + resumo + tarefas do dia
     ========================================================= */
  function iniciarRotina() {
    const grade = $("#cal-grade"), selMes = $("#cal-mes"), selAno = $("#cal-ano");
    if (!grade || !selMes || !selAno) return;

    const hojeData = new Date();
    const params = new URLSearchParams(window.location.search);
    let dataSel = ehISO(params.get("data")) ? params.get("data") : hojeISO();

    const anoSel = deISO(dataSel).getFullYear();
    const primeiroAno = Math.min(hojeData.getFullYear() - 1, anoSel);
    const ultimoAno = Math.max(hojeData.getFullYear() + 2, anoSel);
    selAno.textContent = "";
    for (let a = primeiroAno; a <= ultimoAno; a++) selAno.add(new Option(a, a));

    const listaDia = $("#dia-tarefas"), resumo = $("#resumo-semana"), botaoAdicionar = $(".menu__adicionar");

    function desenhar() {
      const todas = carregarTarefas(), concluidas = carregarConcluidas(), cuidados = carregarCuidados();
      const prioridade = Boolean(cuidados.prioridade);
      const sel = deISO(dataSel);
      selMes.value = String(sel.getMonth()); selAno.value = String(sel.getFullYear());
      desenharCalendario(todas, prioridade, sel);
      desenharDetalhe(todas, concluidas, cuidados, prioridade, sel);
      desenharResumo(todas, prioridade, sel);
      if (botaoAdicionar) botaoAdicionar.href = "nova-tarefa.html?data=" + dataSel; // "+" já abre neste dia
    }

    function desenharCalendario(todas, prioridade, sel) {
      const mes = sel.getMonth(), ano = sel.getFullYear();
      const primeiro = new Date(ano, mes, 1).getDay();
      const total = new Date(ano, mes + 1, 0).getDate();
      $$(".calendario__dia", grade).forEach((el) => el.remove());

      for (let i = 0; i < primeiro; i++) {
        const v = document.createElement("span"); v.className = "calendario__dia is-vazio"; v.setAttribute("aria-hidden", "true"); grade.appendChild(v);
      }
      for (let dia = 1; dia <= total; dia++) {
        const diaISO = ano + "-" + doisDigitos(mes + 1) + "-" + doisDigitos(dia);
        const q = tarefasDoDia(diaISO, todas, prioridade).length;
        const b = document.createElement("button");
        b.type = "button"; b.className = "calendario__dia"; b.textContent = dia; b.dataset.data = diaISO;
        if (q > 0) b.classList.add("is-marcado");
        if (diaISO === hojeISO()) b.classList.add("is-hoje");
        const s = diaISO === dataSel;
        if (s) b.classList.add("is-selecionado");
        b.setAttribute("aria-pressed", String(s));
        b.setAttribute("aria-label", dia + " de " + MESES[mes] + ", " + DIAS[new Date(ano, mes, dia).getDay()] + (q ? ", " + q + " " + plural(q, "tarefa", "tarefas") : ""));
        grade.appendChild(b);
      }
      const sobra = (7 - ((primeiro + total) % 7)) % 7;
      for (let i = 1; i <= sobra; i++) {
        const f = document.createElement("span"); f.className = "calendario__dia is-fora"; f.setAttribute("aria-hidden", "true"); f.textContent = i; grade.appendChild(f);
      }
    }

    function desenharDetalhe(todas, concluidas, cuidados, prioridade, sel) {
      const tarefas = tarefasDoDia(dataSel, todas, prioridade);
      $("#dia-titulo").textContent = "Dia " + sel.getDate() + " • " + DIAS[sel.getDay()];
      $("#dia-qtd").textContent = tarefas.length === 0 ? "Nenhuma tarefa agendada" : tarefas.length + " " + plural(tarefas.length, "tarefa agendada", "tarefas agendadas");
      $("#dia-lista").textContent = tarefas.length === 0 ? "Dia livre. Toque no + para planejar." : tarefas.map((t) => t.nome).join(" • ");
      listaDia.textContent = "";
      tarefas.forEach((t) => listaDia.appendChild(criarItemTarefa(t, dataSel, concluidas, cuidados)));
    }

    function desenharResumo(todas, prioridade, sel) {
      const inicio = somarDias(dataSel, -sel.getDay());
      resumo.textContent = "";
      let algum = false;
      for (let i = 0; i < 7; i++) {
        const dia = somarDias(inicio, i);
        const tarefas = tarefasDoDia(dia, todas, prioridade);
        if (tarefas.length === 0) continue;
        algum = true;
        const item = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button"; b.className = "resumo-semana__dia" + (dia === dataSel ? " is-selecionado" : ""); b.dataset.data = dia;
        const nome = document.createElement("span"); nome.className = "resumo-semana__nome"; nome.textContent = DIAS_CURTOS[deISO(dia).getDay()];
        b.appendChild(nome);
        tarefas.slice(0, 3).forEach((t) => {
          const l = document.createElement("span"); l.className = "resumo-semana__item"; l.textContent = t.nome; b.appendChild(l);
        });
        if (tarefas.length > 3) {
          const m = document.createElement("span"); m.className = "resumo-semana__item";
          m.textContent = "+" + (tarefas.length - 3) + " " + plural(tarefas.length - 3, "tarefa", "tarefas"); b.appendChild(m);
        }
        item.appendChild(b); resumo.appendChild(item);
      }
      if (!algum) {
        const v = document.createElement("li"); v.className = "resumo-semana__vazio"; v.textContent = "Semana livre: nenhuma tarefa agendada."; resumo.appendChild(v);
      }
    }

    function irParaMes(passo) {
      const sel = deISO(dataSel);
      let mes = sel.getMonth() + passo, ano = sel.getFullYear();
      if (mes < 0) { mes = 11; ano -= 1; }
      if (mes > 11) { mes = 0; ano += 1; }
      if (ano < primeiroAno || ano > ultimoAno) return;
      escolherMes(ano, mes);
    }
    function escolherMes(ano, mes) {
      const atual = ano === hojeData.getFullYear() && mes === hojeData.getMonth();
      dataSel = atual ? hojeISO() : ano + "-" + doisDigitos(mes + 1) + "-01";
      desenhar();
    }

    grade.addEventListener("click", (e) => {
      const b = e.target.closest("button.calendario__dia");
      if (!b) return;
      dataSel = b.dataset.data; desenhar();
      const novo = $('.calendario__dia[data-data="' + dataSel + '"]', grade);
      if (novo) novo.focus();
    });
    resumo.addEventListener("click", (e) => {
      const b = e.target.closest("button.resumo-semana__dia");
      if (!b) return;
      dataSel = b.dataset.data; desenhar();
    });
    $("#cal-anterior").addEventListener("click", () => irParaMes(-1));
    $("#cal-proximo").addEventListener("click", () => irParaMes(1));
    selMes.addEventListener("change", () => escolherMes(Number(selAno.value), Number(selMes.value)));
    selAno.addEventListener("change", () => escolherMes(Number(selAno.value), Number(selMes.value)));
    ligarChecks(listaDia, (id, dia) => { desenhar(); devolverFoco(id, dia); });
    desenhar();
    mostrarAvisoPendente();
  }

  /* =========================================================
     CUIDADOS
       Previsibilidade -> Hoje mostra "Próxima: ... (em X min)"
       Pausas          -> tarefas longas mostram "pausa a cada X min"
       Modo Calmo      -> tela escura e sem animações
       Sessões curtas  -> tarefas longas mostram "N sessões de X min"
       Recuperação     -> Hoje mostra "Para recuperar" (7 dias)
       Prioridade      -> importantes sobem na lista e ganham destaque
     ========================================================= */
  function iniciarCuidados() {
    const interruptores = $$(".interruptor[name]");
    if (interruptores.length === 0) return;
    const estado = carregarCuidados();
    interruptores.forEach((el) => { el.checked = Boolean(estado[el.name]); });
    interruptores.forEach((el) => {
      el.addEventListener("change", () => {
        estado[el.name] = el.checked; guardar(CHAVES.cuidados, estado); aplicarCuidados();
      });
    });
  }

  /* =========================================================
     USUÁRIO: perfil + estatísticas reais
     ========================================================= */
  function calcularEstatisticas() {
    const tarefas = carregarTarefas(), porId = {};
    tarefas.forEach((t) => { porId[t.id] = t; });
    const concluidas = carregarConcluidas();
    let feitas = 0;
    const dias = new Set();
    concluidas.forEach((chave) => {
      const [id, dia] = chave.split("|");
      const t = porId[id];
      if (t && ocorreEm(t, dia)) { feitas++; dias.add(dia); }
    });
    let metas = 0;
    dias.forEach((dia) => {
      const doDia = tarefas.filter((t) => ocorreEm(t, dia));
      if (doDia.length > 0 && doDia.every((t) => concluidas.has(chaveConclusao(t, dia)))) metas++;
    });
    let sequencia = 0, cursor = hojeISO();
    if (!dias.has(cursor)) cursor = somarDias(cursor, -1);
    while (dias.has(cursor)) { sequencia++; cursor = somarDias(cursor, -1); }
    return { sequencia, feitas, metas };
  }

  function iniciarUsuario() {
    const form = $("#form-perfil"), botao = $(".perfil__editar");
    if (!form || !botao) return;
    const est = calcularEstatisticas();
    $$("[data-estatistica]").forEach((el) => { el.textContent = doisDigitos(est[el.dataset.estatistica] || 0); });

    const campos = { nome: $("#perfil-nome"), idade: $("#perfil-idade"), neuro: $("#perfil-neuro"), objetivos: $("#perfil-objetivos") };
    const titulo = $("#usuario-titulo");
    const textoBotao = botao.firstChild;

    const salvo = ler(CHAVES.perfil, null);
    if (salvo) Object.keys(campos).forEach((k) => { if (typeof salvo[k] === "string") campos[k].value = salvo[k]; });

    const atualizarNome = () => { titulo.textContent = campos.nome.value.trim().split(/\s+/)[0] || "Perfil"; };
    atualizarNome();

    let editando = false;
    botao.addEventListener("click", () => {
      editando = !editando;
      Object.values(campos).forEach((c) => { c.readOnly = !editando; });
      form.classList.toggle("is-editando", editando);
      textoBotao.textContent = editando ? " Salvar perfil " : " Editar perfil ";
      if (editando) { campos.nome.focus(); return; }
      const dados = {};
      Object.keys(campos).forEach((k) => { dados[k] = campos[k].value.trim(); });
      guardar(CHAVES.perfil, dados);
      atualizarNome(); atualizarAvatares(); mostrarAviso("Perfil salvo");
    });
    form.addEventListener("submit", (e) => e.preventDefault());
  }

  /* ---------- Início ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    aplicarCuidados();
    atualizarAvatares();
    iniciarHoje();
    iniciarNovaTarefa();
    iniciarRotina();
    iniciarCuidados();
    iniciarUsuario();
  });
})();

/* =========================================================
   EXTRAS: login/questionário, configurações, preferências visuais
   e ligações com o questionário (segundo bloco; roda depois do primeiro)
   ========================================================= */
/* =========================================================
   NEUROPLAN · extras.js  (carregue DEPOIS do script.js)
   Login/questionário, configurações, engrenagem no cabeçalho,
   tamanho de texto e "reduzir animações" em todas as páginas.
   ========================================================= */
(function () {
  "use strict";

  const EXIGIR_LOGIN = true; // false = o app abre direto, sem pedir cadastro
  const K = {
    conta: "neuroplan:conta", config: "neuroplan:config",
    cuidados: "neuroplan:cuidados", perfil: "neuroplan:perfil",
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const ler = (k, p) => { try { const v = localStorage.getItem(k); return v === null ? p : JSON.parse(v); } catch (e) { return p; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage */ } };

  const pagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const ehLogin = pagina.indexOf("login") === 0;
  const params = new URLSearchParams(location.search);

  /* ---------- Porteiro: sem cadastro -> login ---------- */
  if (EXIGIR_LOGIN && !ehLogin && !ler(K.conta, null)) {
    location.replace("login.html");
    return;
  }

  /* ---------- Configurações visuais (todas as páginas) ---------- */
  const TAMANHOS = { p: "87.5%", m: "100%", g: "112.5%", xg: "125%" };
  function aplicarConfig() {
    const c = ler(K.config, {});
    document.documentElement.style.fontSize = TAMANHOS[c.fonte] || "100%";
    document.body.classList.toggle("sem-animacao", Boolean(c.semAnimacao));
    const calmo = Boolean(ler(K.cuidados, {})["modo-calmo"]);
    document.body.classList.toggle("modo-calmo", calmo);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = calmo ? "#15122B" : "#7B68EE";
  }

  /* ---------- Engrenagem no cabeçalho ---------- */
  function inserirEngrenagem() {
    const topo = $(".topo");
    const avatar = $(".topo .avatar");
    if (!topo || !avatar || $(".topo__config")) return;
    const caixa = document.createElement("div");
    caixa.className = "topo__acoes";
    const a = document.createElement("a");
    a.href = "configuracoes.html";
    a.className = "topo__config";
    a.setAttribute("aria-label", "Configurações");
    a.innerHTML = '<svg class="icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
    topo.insertBefore(caixa, avatar);
    caixa.append(a, avatar);
  }

  /* =========================================================
     LOGIN / QUESTIONÁRIO
     ========================================================= */
  const GRUPOS = ["tdah_dificuldades", "tea_sensorial", "tea_comunicacao"];

  function iniciarLogin() {
    const form = $("#form-login");
    if (!form) return;
    const passos = $$(".login__passo", form);
    const btnVoltar = $("#login-voltar");
    const btnAvancar = $("#login-avancar");
    const barra = $("#login-barra");
    const txt = $("#login-passo-txt");
    const refazer = params.get("refazer") === "1";
    let atual = 0;

    // Ao refazer: preenche com as respostas anteriores
    const conta = ler(K.conta, null);
    if (conta && !refazer) { location.replace("index.html"); return; }
    if (conta && conta.respostas) {
      Object.keys(conta.respostas).forEach((nome) => {
        const v = conta.respostas[nome];
        $$('[name="' + nome + '"]', form).forEach((el) => {
          if (el.type === "radio") el.checked = el.value === v;
          else if (el.type === "checkbox") el.checked = Array.isArray(v) ? v.indexOf(el.value) > -1 : Boolean(v);
          else el.value = v;
        });
      });
    }

    const valor = (n) => { const e = form.elements[n]; return e ? e.value : ""; };
    function visiveis() {
      const d = valor("diagnostico");
      return passos.filter((p) => {
        const id = p.dataset.passo;
        if (id === "tdah") return d === "TDAH" || d === "TDAH + TEA" || d === "Em investigação";
        if (id === "tea") return d === "TEA" || d === "TDAH + TEA" || d === "Em investigação";
        return true;
      });
    }

    function erro(campo, msg) {
      $$(".campo__erro", campo.closest(".campo") || campo.parentElement).forEach((e) => e.remove());
      const p = document.createElement("p");
      p.className = "campo__erro"; p.setAttribute("role", "alert"); p.textContent = msg;
      (campo.closest(".campo") || campo.parentElement).appendChild(p);
      campo.focus();
    }
    function validar(passo) {
      $$(".campo__erro", passo).forEach((e) => e.remove());
      if (passo.dataset.passo === "conta") {
        if (!valor("nome").trim()) { erro(form.elements.nome, "Diga como quer ser chamado(a)."); return false; }
        const idade = Number(valor("idade"));
        if (!idade || idade < 5 || idade > 99) { erro(form.elements.idade, "Informe uma idade válida."); return false; }
        if (!valor("diagnostico")) { erro($('[name="diagnostico"]', form), "Escolha uma opção."); return false; }
      }
      if (passo.dataset.passo === "final") {
        if (!form.elements.consentimento.checked) { erro(form.elements.consentimento, "Marque para continuar."); return false; }
        if (Number(valor("idade")) < 18 && !form.elements.responsavel.checked) { erro(form.elements.responsavel, "Peça para um responsável saber que você usa o app."); return false; }
      }
      return true;
    }

    function mostrar() {
      const lista = visiveis();
      atual = Math.min(atual, lista.length - 1);
      passos.forEach((p) => p.classList.toggle("is-atual", p === lista[atual]));
      barra.style.width = ((atual + 1) / lista.length * 100) + "%";
      txt.textContent = "Passo " + (atual + 1) + " de " + lista.length;
      btnVoltar.hidden = atual === 0;
      btnAvancar.textContent = atual === lista.length - 1 ? "Concluir" : "Continuar";
      $("#l-resp-box").hidden = Number(valor("idade")) >= 18 || !valor("idade");
      window.scrollTo({ top: 0 });
    }

    btnVoltar.addEventListener("click", () => { atual = Math.max(0, atual - 1); mostrar(); });
    btnAvancar.addEventListener("click", () => {
      const lista = visiveis();
      if (!validar(lista[atual])) return;
      if (atual < lista.length - 1) { atual++; mostrar(); } else concluir();
    });
    form.addEventListener("submit", (e) => e.preventDefault());

    function coletar() {
      const r = {};
      Array.from(form.elements).forEach((el) => {
        if (!el.name || r[el.name] !== undefined) return;
        if (GRUPOS.indexOf(el.name) > -1) r[el.name] = $$('[name="' + el.name + '"]:checked', form).map((x) => x.value);
        else if (el.type === "checkbox") r[el.name] = el.checked;
        else if (el.type === "radio") r[el.name] = valor(el.name);
        else r[el.name] = el.value.trim();
      });
      return r;
    }

    // Liga automaticamente os "Cuidados" que fazem sentido para as respostas
    function sugerirCuidados(r) {
      const tdah = r.diagnostico !== "TEA";
      const tea = r.diagnostico !== "TDAH";
      const dif = r.tdah_dificuldades || [];
      const sens = r.tea_sensorial || [];
      const c = {};
      if (tdah) { c.pausas = true; c["sessoes-curtas"] = true; c.prioridade = true; }
      if (tdah && (dif.indexOf("esquecimento") > -1 || dif.indexOf("comecar") > -1)) c.recuperacao = true;
      if (tea && (r.tea_previsao === "muito" || r.tea_mudancas === "dificil")) c.previsibilidade = true;
      if (tdah && dif.indexOf("tempo") > -1) c.previsibilidade = true;
      if (tea && sens.length > 0) c["modo-calmo"] = true;
      return c;
    }

    function concluir() {
      const r = coletar();
      gravar(K.conta, { criadoEm: new Date().toISOString(), respostas: r });
      gravar(K.perfil, {
        nome: r.nome, idade: r.idade + " anos", neuro: r.diagnostico,
        objetivos: r.objetivos || "",
      });
      if (!refazer) {
        gravar(K.cuidados, Object.assign({}, ler(K.cuidados, {}), sugerirCuidados(r)));
        const sens = r.tea_sensorial || [];
        if (sens.indexOf("visual") > -1 || sens.indexOf("luz") > -1) {
          gravar(K.config, Object.assign({}, ler(K.config, {}), { semAnimacao: true }));
        }
      }
      location.href = refazer ? "configuracoes.html" : "index.html";
    }

    form.elements.idade.addEventListener("input", () => { $("#l-resp-box").hidden = Number(valor("idade")) >= 18 || !valor("idade"); });
    $$('[name="diagnostico"]', form).forEach((el) => el.addEventListener("change", mostrar));
    mostrar();
  }

  /* =========================================================
     CONFIGURAÇÕES
     ========================================================= */
  function iniciarConfig() {
    const resumo = $("#config-resumo");
    if (!resumo) return;

    const conta = ler(K.conta, null);
    if (conta && conta.respostas) {
      const r = conta.respostas;
      resumo.textContent = "";
      const nome = document.createElement("strong");
      nome.textContent = r.nome;
      resumo.append(nome, document.createTextNode(r.diagnostico + " · " + r.idade + " anos"));
    }

    const calmo = $("#cfg-calmo");
    const anim = $("#cfg-animacao");
    const cfg = ler(K.config, {});
    calmo.checked = Boolean(ler(K.cuidados, {})["modo-calmo"]);
    anim.checked = Boolean(cfg.semAnimacao);
    const fonte = $('input[name="fonte"][value="' + (cfg.fonte || "m") + '"]');
    if (fonte) fonte.checked = true;

    calmo.addEventListener("change", () => {
      const c = ler(K.cuidados, {}); c["modo-calmo"] = calmo.checked; gravar(K.cuidados, c); aplicarConfig();
    });
    anim.addEventListener("change", () => {
      const c = ler(K.config, {}); c.semAnimacao = anim.checked; gravar(K.config, c); aplicarConfig();
    });
    $$('input[name="fonte"]').forEach((el) => el.addEventListener("change", () => {
      const c = ler(K.config, {}); c.fonte = el.value; gravar(K.config, c); aplicarConfig();
    }));

    $("#btn-sair").addEventListener("click", () => {
      if (!confirm("Sair da conta? Suas tarefas continuam salvas.")) return;
      try { localStorage.removeItem(K.conta); } catch (e) { /* ignora */ }
      location.href = "login.html";
    });

    $("#btn-exportar").addEventListener("click", () => {
      const dados = {};
      Object.keys(localStorage).filter((k) => k.indexOf("neuroplan:") === 0).forEach((k) => { dados[k] = ler(k, null); });
      const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = "neuroplan-meus-dados.json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    $("#btn-apagar").addEventListener("click", () => {
      if (!confirm("Apagar TODAS as tarefas, o perfil e as respostas? Não dá para desfazer.")) return;
      Object.keys(localStorage).filter((k) => k.indexOf("neuroplan:") === 0).forEach((k) => localStorage.removeItem(k));
      location.href = "login.html";
    });
  }


  /* =========================================================
     LIGAÇÕES COM O QUESTIONÁRIO
     ========================================================= */
  const respostas = () => (ler(K.conta, null) || {}).respostas || {};

  // HOJE: dica com o melhor período de foco da pessoa
  function iniciarDicaPeriodo() {
    const titulo = $("#tela-hoje .titulo-tela");
    const periodo = respostas().tdah_periodo;
    const faixas = { manha: [6, 12, "de manhã"], tarde: [12, 18, "à tarde"], noite: [18, 23, "à noite"] };
    if (!titulo || !faixas[periodo]) return;
    const [ini, fim, nome] = faixas[periodo];
    const dica = $("#dica-periodo");
    if (!dica) return;
    dica.hidden = false;
    function atualizar() {
      const h = new Date().getHours();
      dica.textContent = h >= ini && h < fim
        ? "Agora é o seu melhor horário de foco. Bom momento para a tarefa mais difícil."
        : "Você rende melhor " + nome + " (" + ini + "h–" + fim + "h). Deixe o mais difícil para lá.";
    }
    atualizar();
    setInterval(atualizar, 60000);
  }

  // USUÁRIO: o que o usuário edita no perfil também atualiza as respostas guardadas
  function sincronizarPerfil() {
    const botao = $(".perfil__editar");
    const form = $("#form-perfil");
    if (!botao || !form) return;
    function diagnostico(texto, atual) {
      const t = (texto || "").toLowerCase();
      const tdah = t.indexOf("tdah") > -1;
      const tea = /\btea\b|autis/.test(t);
      if (tdah && tea) return "TDAH + TEA";
      if (tdah) return "TDAH";
      if (tea) return "TEA";
      return atual;
    }
    botao.addEventListener("click", () => {
      if (form.classList.contains("is-editando")) return; // ainda editando; só sincroniza ao salvar
      const conta = ler(K.conta, null);
      const perfil = ler(K.perfil, null);
      if (!conta || !conta.respostas || !perfil) return;
      const r = conta.respostas;
      if (perfil.nome) r.nome = perfil.nome;
      const idade = parseInt(perfil.idade, 10);
      if (idade) r.idade = String(idade);
      r.diagnostico = diagnostico(perfil.neuro, r.diagnostico);
      if (typeof perfil.objetivos === "string") r.objetivos = perfil.objetivos;
      gravar(K.conta, conta);
    });
  }

  // CUIDADOS: descrições refletem o tempo de foco da pessoa
  function ajustarTextosCuidados() {
    const foco = Number(respostas().tdah_foco);
    if (!foco) return;
    const pausa = Math.min(45, foco * 2);
    const pausas = $('input[name="pausas"]');
    const sessoes = $('input[name="sessoes-curtas"]');
    const desc = (el) => el && el.closest(".cuidado") && $(".cuidado__descricao", el.closest(".cuidado"));
    if (desc(pausas)) desc(pausas).textContent = "Adiciona pausas a cada " + pausa + " minutos antes e durante as tarefas";
    if (desc(sessoes)) desc(sessoes).textContent = "Divide uma tarefa grande em sessões de " + foco + " min";
  }

  document.addEventListener("DOMContentLoaded", () => {
    aplicarConfig();
    inserirEngrenagem();
    iniciarLogin();
    iniciarConfig();
    iniciarDicaPeriodo();
    sincronizarPerfil();
    ajustarTextosCuidados();
  });
})();