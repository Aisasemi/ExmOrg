import * as d3 from 'd3';
import { flextree } from 'd3-flextree';
import './style.css';

/* ==========================================================================
   DEFAULT DEMO DATA & STATE
   ========================================================================== */

const defaultTree = {
  "id": "node-root-org",
  "name": "Nueva Organización",
  "type": "organizacion",
  "description": "Nodo raíz del organigrama.",
  "children": [
    {
      "id": "node-1779797503492-371",
      "name": "Direccion",
      "type": "agrupacion",
      "description": "",
      "children": [
        {
          "id": "node-1779797887294-527",
          "name": "Sede GC",
          "type": "sede",
          "description": "",
          "children": [
            {
              "id": "node-1779797949503-911",
              "name": "Calidad",
              "type": "departamento",
              "description": "",
              "children": [
                {
                  "id": "node-1779798082169-422",
                  "name": "Auditores",
                  "type": "puesto",
                  "description": "",
                  "children": [
                    {
                      "id": "node-1779798256999-614",
                      "name": "Cristina",
                      "type": "empleado",
                      "description": "",
                      "children": []
                    }
                  ]
                },
                {
                  "id": "node-1779798097110-416",
                  "name": "Consultores",
                  "type": "puesto",
                  "description": "",
                  "children": []
                }
              ]
            },
            {
              "id": "node-1779797993674-169",
              "name": "Ventas",
              "type": "departamento",
              "description": "",
              "children": [
                {
                  "id": "node-1779798108459-532",
                  "name": "Comerciales",
                  "type": "puesto",
                  "description": "",
                  "children": []
                },
                {
                  "id": "node-1779798137481-542",
                  "name": "Facturacion",
                  "type": "puesto",
                  "description": "",
                  "children": []
                }
              ]
            }
          ]
        },
        {
          "id": "node-1779797926302-564",
          "name": "Sede TF",
          "type": "sede",
          "description": "",
          "children": [
            {
              "id": "node-1779797964253-630",
              "name": "Ventas",
              "type": "departamento",
              "description": "",
              "children": []
            }
          ],
          "referencesNodeId": "node-1779797887294-527",
          "customData": {
            "node-1779798082169-422": {
              "employees": [
                {
                  "id": "node-1779798262977-370",
                  "name": "Sonia",
                  "type": "empleado",
                  "description": "",
                  "children": []
                }
              ]
            }
          }
        }
      ],
      "internalChildren": [
        {
          "id": "node-1779797825730-464",
          "name": "Director A",
          "type": "puesto",
          "description": "",
          "children": [
            {
              "id": "node-1779797856723-434",
              "name": "Pepe",
              "type": "empleado",
              "description": "",
              "children": []
            }
          ]
        },
        {
          "id": "node-1779797838757-365",
          "name": "Director B",
          "type": "puesto",
          "description": "",
          "children": [
            {
              "id": "node-1779797864762-681",
              "name": "Pepa",
              "type": "empleado",
              "description": "",
              "children": []
            }
          ]
        }
      ]
    }
  ]
};

// Node dimensions configuration
const nodeSizes = {
  organizacion: [240, 110],
  sede: [200, 95],
  departamento: [200, 95],
  puesto: [180, 85],
  empleado: [170, 75],
  agrupacion: [220, 115]
};

// Main State
let globalRoot = JSON.parse(JSON.stringify(defaultTree));
let navigationStack = []; // Focus stack levels (stores resolved grouping node IDs)
let selectedNode = null; // References node in the RESOLVED tree
let currentLayoutRoot = null;

// Flat rendering lists
let flatNodesList = [];
let flatLinksList = [];

// D3 Selections & Zoom
let svg = null;
let gContainer = null;
let gGroupings = null;
let gLinks = null;
let gNodes = null;
let zoomBehavior = null;

/* ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initSVG();
  initUIListeners();
  
  // Try loading from localStorage, fallback to default
  const saved = localStorage.getItem('flexorg_data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const val = validateOrgChart(parsed);
      if (val.valid) {
        globalRoot = parsed;
      } else {
        console.warn("Saved structure invalid, loading default demo:", val.error);
      }
    } catch(e) {
      console.warn("Failed parsing saved data:", e);
    }
  }
  
  renderTree();
  setTimeout(fitTreeToScreen, 100);
});

function initSVG() {
  const container = document.getElementById('canvas-container');
  container.innerHTML = '';

  svg = d3.select(container)
    .append('svg')
    .attr('class', 'org-svg')
    .attr('id', 'main-svg');

  const defs = svg.append('defs');
  
  // Glow filter
  const filter = defs.append('filter')
    .attr('id', 'glow-effect')
    .attr('x', '-20%')
    .attr('y', '-20%')
    .attr('width', '140%')
    .attr('height', '140%');
  filter.append('feGaussianBlur')
    .attr('stdDeviation', '4')
    .attr('result', 'blur');
  filter.append('feComposite')
    .attr('in', 'SourceGraphic')
    .attr('in2', 'blur')
    .attr('operator', 'over');

  // Linear Gradient for Org Card
  const gradOrg = defs.append('linearGradient')
    .attr('id', 'grad-org')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '100%')
    .attr('y2', '100%');
  gradOrg.append('stop')
    .attr('offset', '0%')
    .attr('stop-color', 'var(--color-node-org-start)');
  gradOrg.append('stop')
    .attr('offset', '100%')
    .attr('stop-color', 'var(--color-node-org-end)');

  gContainer = svg.append('g')
    .attr('class', 'zoom-container');

  gGroupings = gContainer.append('g').attr('class', 'groupings-layer');
  gLinks = gContainer.append('g').attr('class', 'links-layer');
  gNodes = gContainer.append('g').attr('class', 'nodes-layer');

  zoomBehavior = d3.zoom()
    .scaleExtent([0.08, 3.0])
    .on('zoom', (event) => {
      gContainer.attr('transform', event.transform);
    });

  svg.call(zoomBehavior);

  svg.on('click', () => {
    selectNode(null);
  });
}

function initUIListeners() {
  // Zoom Controls
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    zoomBehavior.scaleBy(svg.transition().duration(250), 1.3);
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    zoomBehavior.scaleBy(svg.transition().duration(250), 1 / 1.3);
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    fitTreeToScreen();
  });

  // Sidebar Form Input listeners for live updates
  const propName = document.getElementById('node-prop-name');
  const propDesc = document.getElementById('node-prop-description');

  propName.addEventListener('input', (e) => {
    if (selectedNode) {
      handlePropertyEdit(selectedNode.id, e.target.value.trim(), selectedNode.description);
    }
  });

  propDesc.addEventListener('input', (e) => {
    if (selectedNode) {
      handlePropertyEdit(selectedNode.id, selectedNode.name, e.target.value.trim());
    }
  });

  // Sidebar Collapse switch listener
  const propCollapsed = document.getElementById('node-prop-collapsed');
  propCollapsed.addEventListener('change', () => {
    if (selectedNode) {
      toggleNodeCollapse(selectedNode.id);
    }
  });

  // Sidebar Internal Collapse switch listener (agrupaciones only)
  const propCollapsedInternal = document.getElementById('node-prop-collapsed-internal');
  propCollapsedInternal.addEventListener('change', () => {
    if (selectedNode) {
      toggleNodeInternalCollapse(selectedNode.id);
    }
  });

  // Select reference dropdown listener
  document.getElementById('node-prop-reference').addEventListener('change', (e) => {
    if (!selectedNode || selectedNode.isClone) return;
    const refId = e.target.value || null;
    
    const realNode = findNodeById(globalRoot, selectedNode.id);
    if (realNode) {
      realNode.referencesNodeId = refId;
      if (refId) {
        // Clear children of referenced nodes to avoid overlapping structure
        realNode.children = [];
        if (realNode.type === 'agrupacion') {
          realNode.internalChildren = [];
        }
        showToast("Vinculado con éxito. Estructura copiada del origen.", "success");
      } else {
        showToast("Desvinculado. Ahora puedes crear una estructura propia.", "info");
      }
      
      renderTree(false);
      saveToStorage();
      
      // Re-select resolved node
      const resolvedRoot = resolveTree(globalRoot);
      const updatedNode = findNodeById(resolvedRoot, selectedNode.id);
      selectNode(updatedNode);
    }
  });

  // Delete Node Button
  document.getElementById('btn-delete-node').addEventListener('click', () => {
    if (selectedNode) {
      const activeRoot = getActiveRootResolved();
      if (selectedNode.id === activeRoot.id) {
        showToast("No puedes eliminar el nodo raíz de este nivel.", "error");
        return;
      }
      if (confirm(`¿Estás seguro de eliminar "${selectedNode.name}" y todos sus descendientes?`)) {
        handleDeleteNode(selectedNode.id);
      }
    }
  });

  // Focus Grouping internal tree
  document.getElementById('btn-enter-grouping').addEventListener('click', () => {
    if (selectedNode && selectedNode.type === 'agrupacion') {
      enterGrouping(selectedNode);
    }
  });

  // Add Child Form Submission
  document.getElementById('form-add-child').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selectedNode) return;

    const childType = document.getElementById('child-type').value;
    const childName = document.getElementById('child-name').value.trim();
    const childDesc = document.getElementById('child-description').value.trim();
    let relationVal = 'external';

    const relationContainer = document.getElementById('group-child-relation-container');
    if (relationContainer.style.display !== 'none') {
      relationVal = document.querySelector('input[name="child-relation"]:checked').value;
    }

    if (!childName) return;

    handleAddChild(selectedNode.id, childName, childType, childDesc, relationVal);

    // Clear form inputs
    document.getElementById('child-name').value = '';
    document.getElementById('child-description').value = '';
  });

  // Exit grouping button
  document.getElementById('btn-exit-grouping').addEventListener('click', () => {
    exitGrouping();
  });

  // Top header action buttons
  document.getElementById('btn-load-example').addEventListener('click', () => {
    if (confirm("¿Deseas restablecer el organigrama al ejemplo por defecto? Esto borrará tus cambios actuales.")) {
      globalRoot = JSON.parse(JSON.stringify(defaultTree));
      navigationStack = [];
      selectNode(null);
      renderTree();
      fitTreeToScreen();
      saveToStorage();
      showToast("Ejemplo cargado correctamente.", "success");
    }
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm("¿Deseas vaciar el organigrama y comenzar desde cero?")) {
      globalRoot = {
        id: "node-root-org",
        name: "Nueva Organización",
        type: "organizacion",
        description: "Nodo raíz del organigrama.",
        children: []
      };
      navigationStack = [];
      selectNode(null);
      renderTree();
      fitTreeToScreen();
      saveToStorage();
      showToast("Organigrama reiniciado.", "info");
    }
  });

  // Import Modal Actions
  const importModal = document.getElementById('import-modal');
  const triggerImport = document.getElementById('btn-import-trigger');
  const cancelImport = document.getElementById('btn-cancel-import');
  const closeBtn = document.getElementById('btn-close-modal');
  const submitImport = document.getElementById('btn-submit-import-json');
  const importArea = document.getElementById('textarea-import-json');
  const importErr = document.getElementById('import-error-msg');

  triggerImport.addEventListener('click', () => {
    importArea.value = '';
    importErr.style.display = 'none';
    importModal.style.display = 'flex';
  });

  const closeModal = () => { importModal.style.display = 'none'; };
  cancelImport.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  submitImport.addEventListener('click', () => {
    const rawVal = importArea.value.trim();
    if (!rawVal) return;

    try {
      const parsed = JSON.parse(rawVal);
      const valResult = validateOrgChart(parsed);
      if (valResult.valid) {
        globalRoot = parsed;
        navigationStack = [];
        selectNode(null);
        renderTree();
        fitTreeToScreen();
        saveToStorage();
        closeModal();
        showToast("Organigrama importado con éxito.", "success");
      } else {
        importErr.textContent = `Error de validación: ${valResult.error}`;
        importErr.style.display = 'block';
      }
    } catch(err) {
      importErr.textContent = `Error de sintaxis JSON: ${err.message}`;
      importErr.style.display = 'block';
    }
  });

  // Export JSON Actions
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const jsonStr = JSON.stringify(globalRoot, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      showToast("JSON copiado al portapapeles.", "success");
    }).catch(() => {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'organigrama-flexorg.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast("Descargando archivo JSON.", "info");
    });
  });
}

/* ==========================================================================
   NAVIGATION ENGINE (FOCUS LEVELS & BREADCRUMBS)
   ========================================================================== */

function getActiveRootResolved() {
  const resolvedRoot = resolveTree(globalRoot);
  if (navigationStack.length === 0) {
    return resolvedRoot;
  }
  const lastFocusId = navigationStack[navigationStack.length - 1];
  const found = findNodeById(resolvedRoot, lastFocusId);
  return found || resolvedRoot;
}

function enterGrouping(groupingNode) {
  // Push the visual resolved ID to the navigation stack
  navigationStack.push(groupingNode.id);
  selectNode(null);
  renderTree();
  fitTreeToScreen();
  showToast(`Enfocando organigrama de "${groupingNode.name}"`, "info");
}

function exitGrouping() {
  if (navigationStack.length > 0) {
    navigationStack.pop();
    selectNode(null);
    renderTree();
    fitTreeToScreen();
  }
}

function navigateToLevel(stackIndex) {
  if (stackIndex === -1) {
    navigationStack = [];
  } else {
    navigationStack = navigationStack.slice(0, stackIndex + 1);
  }
  selectNode(null);
  renderTree();
  fitTreeToScreen();
}

function renderBreadcrumbs() {
  const crumbs = document.getElementById('breadcrumbs');
  crumbs.innerHTML = '';

  const homeSpan = document.createElement('span');
  homeSpan.className = `breadcrumbs-item ${navigationStack.length === 0 ? 'active' : ''}`;
  homeSpan.textContent = 'Organigrama Principal';
  if (navigationStack.length > 0) {
    homeSpan.addEventListener('click', () => navigateToLevel(-1));
  }
  crumbs.appendChild(homeSpan);

  const resolvedRoot = resolveTree(globalRoot);
  navigationStack.forEach((focusedId, idx) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumbs-separator';
    sep.textContent = ' › ';
    crumbs.appendChild(sep);

    const isLast = idx === navigationStack.length - 1;
    const crumbSpan = document.createElement('span');
    crumbSpan.className = `breadcrumbs-item ${isLast ? 'active' : ''}`;
    
    // Find name in resolved tree
    const node = findNodeById(resolvedRoot, focusedId);
    crumbSpan.textContent = node ? node.name : "Agrupación";
    
    if (!isLast) {
      crumbSpan.addEventListener('click', () => navigateToLevel(idx));
    }
    crumbs.appendChild(crumbSpan);
  });

  const exitBtn = document.getElementById('btn-exit-grouping');
  if (navigationStack.length > 0) {
    exitBtn.style.display = 'inline-flex';
  } else {
    exitBtn.style.display = 'none';
  }
}

/* ==========================================================================
   DYNAMIC TREE REFERENCE RESOLUTION ENGINE
   ========================================================================== */

function parseId(id) {
  if (typeof id === 'string' && id.includes('-clone-')) {
    const parts = id.split('-clone-');
    return {
      isClone: true,
      anchorId: parts[0],
      sourceId: parts[parts.length - 1]
    };
  }
  return {
    isClone: false,
    sourceId: id,
    anchorId: null
  };
}

function resolveTree(node, anchorNode = null) {
  const resolved = {
    id: anchorNode ? `${anchorNode.id}-clone-${node.id}` : node.id,
    name: node.name,
    type: node.type,
    description: node.description || "",
    isClone: anchorNode !== null,
    sourceId: node.id,
    anchorId: anchorNode ? anchorNode.id : null,
    customData: node.customData || null,
    referencesNodeId: node.referencesNodeId || null,
    collapsed: node.collapsed || false,
    collapsedInternal: node.collapsedInternal || false
  };

  let childList = [];
  
  if (node.referencesNodeId) {
    // Linked node: clone structure from referencesNodeId source (excluding employees)
    const source = findNodeById(globalRoot, node.referencesNodeId);
    if (source) {
      const rawChildren = source.children || [];
      rawChildren.forEach(child => {
        if (child.type !== 'empleado') {
          const anchor = anchorNode || resolved;
          const resolvedChild = resolveTree(child, anchor);
          resolvedChild.sourceParentId = source.id;
          childList.push(resolvedChild);
        }
      });
    }
  } else {
    // Normal children
    const rawChildren = node.children || [];
    rawChildren.forEach(child => {
      if (anchorNode) {
        if (child.type !== 'empleado') {
          const resolvedChild = resolveTree(child, anchorNode);
          resolvedChild.sourceParentId = node.id;
          childList.push(resolvedChild);
        }
      } else {
        const resolvedChild = resolveTree(child, null);
        resolvedChild.sourceParentId = node.id;
        childList.push(resolvedChild);
      }
    });
  }

  // Inject independent employees from anchor's customData
  if (node.type === 'puesto' && anchorNode) {
    const anchorData = anchorNode.customData || {};
    const localData = anchorData[node.id] || {};
    const employees = localData.employees || [];
    
    employees.forEach(emp => {
      const resolvedEmp = resolveTree(emp, anchorNode);
      resolvedEmp.sourceParentId = node.id;
      childList.push(resolvedEmp);
    });
  }

  resolved.children = childList;

  // Resolve internal children for agrupaciones
  let internalList = [];
  if (node.type === 'agrupacion') {
    if (node.referencesNodeId) {
      const source = findNodeById(globalRoot, node.referencesNodeId);
      if (source && source.internalChildren) {
        source.internalChildren.forEach(child => {
          if (child.type !== 'empleado') {
            const anchor = anchorNode || resolved;
            const resolvedChild = resolveTree(child, anchor);
            resolvedChild.sourceParentId = source.id;
            internalList.push(resolvedChild);
          }
        });
      }
    } else {
      const rawInternal = node.internalChildren || [];
      rawInternal.forEach(child => {
        if (anchorNode) {
          if (child.type !== 'empleado') {
            const resolvedChild = resolveTree(child, anchorNode);
            resolvedChild.sourceParentId = node.id;
            internalList.push(resolvedChild);
          }
        } else {
          const resolvedChild = resolveTree(child, null);
          resolvedChild.sourceParentId = node.id;
          internalList.push(resolvedChild);
        }
      });
    }
    resolved.internalChildren = internalList;
  }

  return resolved;
}

/* ==========================================================================
   RECURSIVE LAYOUT CALCULATOR
   ========================================================================== */

function computeLayouts(node, isLayoutRoot = false) {
  const childrenToRecurse = (node.type === 'agrupacion' && isLayoutRoot)
    ? (node.internalChildren || [])
    : (node.children || []);

  if (!node.collapsed) {
    childrenToRecurse.forEach(child => computeLayouts(child, false));
  }

  // Process groupings
  if (node.type === 'agrupacion' && !isLayoutRoot) {
    if (node.internalChildren && node.internalChildren.length > 0 && !node.collapsedInternal) {
      node.internalChildren.forEach(child => computeLayouts(child, false));

      const virtualRoot = {
        id: `${node.id}-virtual-root`,
        type: 'virtual-header',
        name: node.name,
        children: node.internalChildren
      };

      const subH = d3.hierarchy(virtualRoot);
      const subLayout = flextree()
        .nodeSize(n => {
          if (n.data.type === 'virtual-header') {
            return [220, 45];
          }
          const w = n.data.measuredWidth || 180;
          const h = n.data.measuredHeight || 80;
          return [w + 40, h + 60];
        })
        .spacing(() => 0);

      subLayout(subH);

      let minX = Infinity, maxX = -Infinity;
      let maxY = 0;

      subH.descendants().forEach(n => {
        if (n.data.type === 'virtual-header') return;

        const w = n.data.measuredWidth || 180;
        const h = n.data.measuredHeight || 80;

        const left = n.x - w / 2;
        const right = n.x + w / 2;

        if (left < minX) minX = left;
        if (right > maxX) maxX = right;

        const bottom = n.y + 25 + h;
        if (bottom > maxY) maxY = bottom;
      });

      const innerW = maxX - minX;

      const paddingX = 40;
      const paddingY = 20;

      node.measuredWidth = Math.max(220, innerW + paddingX * 2);
      node.measuredHeight = maxY + paddingY;

      node.layoutInfo = {
        hierarchy: subH,
        headerH: 45
      };
    } else {
      node.measuredWidth = 220;
      node.measuredHeight = 115;
      node.layoutInfo = null;
    }
  } else if (node.type === 'agrupacion' && isLayoutRoot) {
    node.measuredWidth = 220;
    node.measuredHeight = 115;
    node.layoutInfo = null;
  } else {
    const size = nodeSizes[node.type] || [200, 90];
    node.measuredWidth = size[0];
    node.measuredHeight = size[1];
  }
}

function propagateGlobalCoordinates(mainHierarchy, activeRoot) {
  mainHierarchy.descendants().forEach(n => {
    n.data.globalX = n.x;
    n.data.globalY = n.y + n.data.measuredHeight / 2;
    n.data.depthLevel = n.depth;

    if (n.data.type === 'agrupacion' && n.data.id !== activeRoot.id && n.data.layoutInfo) {
      propagateInternalCoordinates(n.data, n.x, n.y + n.data.measuredHeight / 2, n.data.measuredHeight, n.depth + 1);
    }
  });
}

function propagateInternalCoordinates(groupingNode, parentGlobalX, parentGlobalY, groupingHeight, depth) {
  const info = groupingNode.layoutInfo;
  if (!info) return;

  const yTop = parentGlobalY - groupingHeight / 2;
  const offsetX = parentGlobalX;

  info.hierarchy.descendants().forEach(subNode => {
    if (subNode.data.type === 'virtual-header') {
      subNode.data.globalX = offsetX;
      subNode.data.globalY = yTop + 22.5;
      return;
    }

    subNode.data.globalX = subNode.x + offsetX;
    subNode.data.globalY = yTop + subNode.y + 25 + subNode.data.measuredHeight / 2;
    subNode.data.depthLevel = depth + subNode.depth;

    if (subNode.data.type === 'agrupacion' && subNode.data.layoutInfo) {
      propagateInternalCoordinates(subNode.data, subNode.data.globalX, subNode.data.globalY, subNode.data.measuredHeight, depth + subNode.depth + 1);
    }
  });
}

function collectFlatLists(activeRoot, mainHierarchy) {
  const flatNodes = [];
  const flatLinks = [];

  mainHierarchy.descendants().forEach(n => {
    flatNodes.push(n.data);
  });

  mainHierarchy.links().forEach(link => {
    flatLinks.push({
      source: link.source.data,
      target: link.target.data,
      isInternal: activeRoot.type === 'agrupacion',
      isFromGroupingHeader: activeRoot.type === 'agrupacion' && link.source.data.id === activeRoot.id
    });
  });

  function collectInternal(node) {
    if (node.type === 'agrupacion' && node.id !== activeRoot.id && node.layoutInfo) {
      const info = node.layoutInfo;

      info.hierarchy.links().forEach(link => {
        const isFromVirtual = link.source.data.type === 'virtual-header';
        flatLinks.push({
          source: isFromVirtual ? node : link.source.data,
          target: link.target.data,
          isInternal: true,
          isFromGroupingHeader: isFromVirtual
        });
      });

      info.hierarchy.descendants().forEach(subNode => {
        if (subNode.data.type !== 'virtual-header') {
          flatNodes.push(subNode.data);
          collectInternal(subNode.data);
        }
      });
    }

    const childrenToRecurse = (node.type === 'agrupacion' && node.id === activeRoot.id)
      ? (node.internalChildren || [])
      : (node.children || []);

    if (!node.collapsed) {
      childrenToRecurse.forEach(c => collectInternal(c));
    }
  }

  collectInternal(activeRoot);

  // Sorting ascending by depthLevel to draw parent background cards first in DOM
  flatNodes.sort((a, b) => (a.depthLevel || 0) - (b.depthLevel || 0));

  return { flatNodes, flatLinks };
}

/* ==========================================================================
   TREE RENDERING & PAINTING ENGINE
   ========================================================================== */

function renderTree(center = false) {
  renderBreadcrumbs();

  // 1. Resolve tree references from globalRoot
  const resolvedRoot = resolveTree(globalRoot);

  // Find active root in resolved tree
  let activeRoot = resolvedRoot;
  if (navigationStack.length > 0) {
    const focusedId = navigationStack[navigationStack.length - 1];
    const found = findNodeById(resolvedRoot, focusedId);
    if (found) activeRoot = found;
  }

  // 2. Compute layouts recursively
  computeLayouts(activeRoot, true);

  // 3. Custom D3 Hierarchy accessor
  const mainH = d3.hierarchy(activeRoot, d => {
    if (d.collapsed) {
      return [];
    }
    if (d.id === activeRoot.id) {
      if (d.type === 'agrupacion') {
        return d.internalChildren || [];
      }
    }
    return d.children || [];
  });

  // 4. FlexTree Layout
  const mainLayout = flextree()
    .nodeSize(n => {
      const w = n.data.measuredWidth || 200;
      const h = n.data.measuredHeight || 90;
      return [w + 50, h + 80];
    })
    .spacing(() => 0);

  mainLayout(mainH);
  currentLayoutRoot = mainH;

  // 5. Global Coordinates Propagation
  propagateGlobalCoordinates(mainH, activeRoot);

  // 6. Flat nodes and links list builder
  const { flatNodes, flatLinks } = collectFlatLists(activeRoot, mainH);
  flatNodesList = flatNodes;
  flatLinksList = flatLinks;

  // 7. Clear stale SVG elements before re-painting to avoid rendering ghosts
  gGroupings.selectAll('.node-group').remove();
  gNodes.selectAll('.node-group').remove();
  gLinks.selectAll('.link').remove();

  // 8. Paint Links
  drawLinks(flatLinks);

  // 9. Paint Nodes
  drawNodes(flatNodes, activeRoot);

  // 10. Refresh sidebar selection details
  updateSidebar();

  if (center) {
    fitTreeToScreen();
  }
}

function drawLinks(linksData) {
  const linkSelection = gLinks.selectAll('.link')
    .data(linksData, d => `${d.source.id}-${d.target.id}`);

  linkSelection.exit().remove();

  const linkEnter = linkSelection.enter()
    .append('path')
    .attr('class', 'link');

  const allLinks = linkEnter.merge(linkSelection);

  allLinks
    .transition()
    .duration(300)
    .attr('d', d => {
      const x0 = d.source.globalX;
      let y0;

      if (d.isFromGroupingHeader) {
        y0 = d.source.globalY - d.source.measuredHeight / 2 + 45; // Grouping Header bottom
      } else {
        y0 = d.source.globalY + d.source.measuredHeight / 2;
      }

      const x1 = d.target.globalX;
      const y1 = d.target.globalY - d.target.measuredHeight / 2;

      const cy = (y0 + y1) / 2;
      return `M${x0},${y0} C${x0},${cy} ${x1},${cy} ${x1},${y1}`;
    });

  allLinks
    .classed('link-internal', d => d.isInternal)
    .classed('link-highlighted', d => selectedNode && (d.source.id === selectedNode.id || d.target.id === selectedNode.id));
}

function drawNodes(nodesData, activeRoot) {
  // Nodes are always freshly created after the layer wipe in renderTree
  const nodeSelection = gContainer.selectAll('.node-group')
    .data(nodesData, d => d.id);

  nodeSelection.exit().remove();

  const nodeEnter = nodeSelection.enter()
    .append('g')
    .attr('class', d => `node-group node-${d.type}`)
    .attr('transform', d => `translate(${d.globalX}, ${d.globalY})`)
    .on('click', (event, d) => {
      event.stopPropagation();
      selectNode(d);
    })
    .on('dblclick', (event, d) => {
      event.stopPropagation();
      if (d.type === 'agrupacion') {
        enterGrouping(d);
      }
    });

  nodeEnter.append('rect').attr('class', 'node-rect');

  const allNodes = nodeEnter.merge(nodeSelection);
  
  // Dispatch nodes to their correct layers to ensure correct SVG z-indexing
  allNodes.each(function(d) {
    if (d.type === 'agrupacion') {
      gGroupings.node().appendChild(this);
    } else {
      gNodes.node().appendChild(this);
    }
  });

  allNodes
    .transition()
    .duration(300)
    .attr('transform', d => `translate(${d.globalX}, ${d.globalY})`)
    .attr('class', d => `node-group node-${d.type} ${selectedNode && selectedNode.id === d.id ? 'node-selected' : ''} ${d.isClone ? 'node-cloned' : ''}`);

  allNodes.select('.node-rect')
    .attr('x', d => -d.measuredWidth / 2)
    .attr('y', d => -d.measuredHeight / 2)
    .attr('width', d => d.measuredWidth)
    .attr('height', d => d.measuredHeight);

  // Redraw card layouts
  allNodes.selectAll('g.card-content').remove();
  const contentG = allNodes.append('g').attr('class', 'card-content');

  contentG.each(function(d) {
    const el = d3.select(this);
    const type = d.type;
    const w = d.measuredWidth;
    const h = d.measuredHeight;

    if (type === 'organizacion' || type === 'sede' || type === 'departamento' || type === 'puesto') {
      let lineColor = 'var(--color-node-org)';
      if (type === 'sede') lineColor = 'var(--color-node-sede)';
      if (type === 'departamento') lineColor = 'var(--color-node-dept)';
      if (type === 'puesto') lineColor = 'var(--color-node-puesto)';
      
      el.append('rect')
        .attr('x', -w / 2)
        .attr('y', -h / 2)
        .attr('width', w)
        .attr('height', 5)
        .attr('fill', lineColor)
        .attr('rx', 2)
        .attr('ry', 2);
    }

    let badgeText = type.toUpperCase();
    if (type === 'organizacion') badgeText = 'ORGANIZACIÓN';
    if (type === 'puesto') badgeText = 'PUESTO TRABAJO';
    if (type === 'agrupacion') badgeText = 'AGRUPACIÓN';
    
    let badgeColor = 'var(--text-muted)';
    if (type === 'organizacion') badgeColor = 'var(--color-node-org)';
    if (type === 'sede') badgeColor = 'var(--color-node-sede)';
    if (type === 'departamento') badgeColor = 'var(--color-node-dept)';
    if (type === 'puesto') badgeColor = 'var(--color-node-puesto)';
    if (type === 'empleado') badgeColor = 'var(--color-node-emp)';
    if (type === 'agrupacion') badgeColor = 'var(--color-node-grp)';

    drawIcon(el, type, -w / 2 + 12, -h / 2 + 10, 14);

    // Draw reference chain link icon
    if (d.isClone) {
      el.append('path')
        .attr('d', "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71m-2.76 2.76L12 17a5 5 0 0 0 7.07 7.07l1.72-1.71")
        .attr('fill', 'none')
        .attr('stroke', '#0f6cbd')
        .attr('stroke-width', '2.5')
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('transform', `translate(${w / 2 - 24}, ${-h / 2 + 10}) scale(0.65)`);
    } else if (d.referencesNodeId) {
      el.append('path')
        .attr('d', "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71m-2.76 2.76L12 17a5 5 0 0 0 7.07 7.07l1.72-1.71")
        .attr('fill', 'none')
        .attr('stroke', '#6264a7')
        .attr('stroke-width', '2.5')
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('transform', `translate(${w / 2 - 24}, ${-h / 2 + 10}) scale(0.65)`);
    }

    if (type === 'empleado') {
      const avatarG = el.append('g').attr('transform', `translate(${-w / 2 + 25}, 0)`);
      avatarG.append('circle').attr('class', 'node-avatar-bg').attr('r', 16);
      avatarG.append('path')
        .attr('class', 'node-avatar-icon')
        .attr('d', 'M0 -7a4 4 0 1 1 -8 0 4 4 0 0 1 8 0zm-11 11a7 7 0 0 1 14 0h-14z')
        .attr('transform', 'translate(-3, 4) scale(0.8)');

      el.append('text')
        .attr('class', 'node-text-title')
        .attr('text-anchor', 'start')
        .attr('x', -w / 2 + 52)
        .attr('y', -4)
        .text(truncateText(d.name, 14));

      el.append('text')
        .attr('class', 'node-text-subtitle')
        .attr('text-anchor', 'start')
        .attr('x', -w / 2 + 52)
        .attr('y', 14)
        .attr('fill', 'var(--color-node-emp)')
        .text(d.isClone ? 'EMPLEADO INDEP.' : 'EMPLEADO');
        
      el.append('text')
        .attr('class', 'node-text-desc')
        .attr('text-anchor', 'start')
        .attr('x', -w / 2 + 52)
        .attr('y', 26)
        .text(truncateText(d.description, 18));
    } else {
      let titleY = 4;
      let descY = 22;
      
      if (type === 'organizacion') {
        titleY = 8;
        descY = 28;
      }
      
      if (type === 'agrupacion') {
        titleY = -h / 2 + 22;
        descY = -h / 2 + 37;

        el.append('text')
          .attr('class', 'node-text-badge')
          .attr('text-anchor', 'end')
          .attr('x', w / 2 - 12)
          .attr('y', -h / 2 + 20)
          .attr('fill', badgeColor)
          .text(badgeText);

        el.append('text')
          .attr('class', 'node-text-title')
          .attr('text-anchor', 'start')
          .attr('x', -w / 2 + 32)
          .attr('y', titleY)
          .text(truncateText(d.name, 18));

        el.append('text')
          .attr('class', 'node-text-desc')
          .attr('text-anchor', 'start')
          .attr('x', -w / 2 + 32)
          .attr('y', descY)
          .text(truncateText(d.description, 26));

        el.append('line')
          .attr('x1', -w / 2 + 10)
          .attr('y1', -h / 2 + 45)
          .attr('x2', w / 2 - 10)
          .attr('y2', -h / 2 + 45)
          .attr('stroke', 'var(--border-color)')
          .attr('stroke-width', 1);

        if (!d.internalChildren || d.internalChildren.length === 0) {
          el.append('rect')
            .attr('x', -90)
            .attr('y', -10)
            .attr('width', 180)
            .attr('height', 45)
            .attr('fill', 'var(--bg-app)')
            .attr('stroke', 'var(--border-color)')
            .attr('stroke-dasharray', '3, 3')
            .attr('rx', 6)
            .attr('ry', 6);

          el.append('text')
            .attr('class', 'node-text-subtitle')
            .attr('text-anchor', 'middle')
            .attr('x', 0)
            .attr('y', 16)
            .attr('fill', 'var(--text-muted)')
            .text('+ Vacío (crea hijos internos)');
        } else if (d.collapsedInternal) {
          const expandBox = el.append('g')
            .attr('class', 'expand-internal-box')
            .on('click', (event) => {
              event.stopPropagation();
              toggleNodeInternalCollapse(d.id);
            });

          expandBox.append('rect')
            .attr('x', -90)
            .attr('y', -10)
            .attr('width', 180)
            .attr('height', 45)
            .attr('fill', 'var(--bg-app)')
            .attr('stroke', 'var(--color-primary)')
            .attr('stroke-dasharray', '4, 4')
            .attr('rx', 6)
            .attr('ry', 6)
            .style('cursor', 'pointer');

          expandBox.append('text')
            .attr('class', 'node-text-subtitle')
            .attr('text-anchor', 'middle')
            .attr('x', 0)
            .attr('y', 16)
            .attr('fill', 'var(--color-primary)')
            .style('font-weight', '600')
            .style('cursor', 'pointer')
            .text(`+ Mostrar contenido (${d.internalChildren.length})`);
        }
      } else {
        el.append('text')
          .attr('class', 'node-text-badge')
          .attr('text-anchor', 'middle')
          .attr('x', 0)
          .attr('y', -h / 2 + 18)
          .attr('fill', badgeColor)
          .text(badgeText);

        el.append('text')
          .attr('class', 'node-text-title')
          .attr('text-anchor', 'middle')
          .attr('x', 0)
          .attr('y', titleY)
          .text(truncateText(d.name, 22));

        el.append('text')
          .attr('class', 'node-text-desc')
          .attr('text-anchor', 'middle')
          .attr('x', 0)
          .attr('y', descY)
          .text(truncateText(d.description, 28));
      }
    }

    // Draw Collapse/Expand Button if node has children and is not the active root
    if (d.id !== activeRoot.id && hasChildren(d)) {
      const btnG = el.append('g')
        .attr('class', 'collapse-btn-group')
        .attr('transform', `translate(0, ${h / 2})`)
        .on('click', (event) => {
          event.stopPropagation();
          toggleNodeCollapse(d.id);
        });

      btnG.append('circle')
        .attr('r', 10)
        .attr('class', 'collapse-btn-circle');

      btnG.append('path')
        .attr('class', 'collapse-btn-icon')
        .attr('d', d.collapsed ? 'M -5 0 L 5 0 M 0 -5 L 0 5' : 'M -5 0 L 5 0');
    }

    // Draw Internal Collapse/Expand Chevron for Groupings
    if (d.type === 'agrupacion' && d.id !== activeRoot.id && d.internalChildren && d.internalChildren.length > 0) {
      const btnG = el.append('g')
        .attr('class', 'internal-collapse-btn-group')
        .attr('transform', `translate(${w / 2 - 20}, ${-h / 2 + 32})`)
        .on('click', (event) => {
          event.stopPropagation();
          toggleNodeInternalCollapse(d.id);
        });

      btnG.append('circle')
        .attr('r', 8)
        .attr('class', 'internal-collapse-btn-circle');

      btnG.append('path')
        .attr('class', 'internal-collapse-btn-icon')
        .attr('d', d.collapsedInternal ? 'M -4 -2 L 0 2 L 4 -2' : 'M -4 2 L 0 -2 L 4 2');
    }
  });
}

function drawIcon(el, type, x, y, size = 14) {
  const paths = {
    organizacion: "M12 2L2 22h20L12 2zm0 3.8L19.2 20H4.8L12 5.8z",
    sede: "M4 21h16v-2H4v2zm2-4h12v-2H6v2zm0-4h12v-2H6v2zm0-4h12V7H6v2zm3-6v2h6V3H9z",
    departamento: "M20 18H4V6h5l2 2h9v10zM20 4h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z",
    puesto: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z",
    agrupacion: "M4 3h16c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm0 2v14h16V5H4z"
  };
  
  const path = paths[type];
  if (!path) return;
  
  const scale = size / 24;
  const colorMap = {
    organizacion: 'org',
    sede: 'sede',
    departamento: 'dept',
    puesto: 'puesto',
    empleado: 'emp',
    agrupacion: 'grp'
  };
  const iconColor = `var(--color-node-${colorMap[type] || 'grp'})`;

  el.append('path')
    .attr('d', path)
    .attr('fill', iconColor)
    .attr('transform', `translate(${x}, ${y}) scale(${scale})`);
}

function truncateText(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}

function getAllowedChildTypes(parentType) {
  const allowed = [
    { value: 'sede', label: 'Sede' },
    { value: 'departamento', label: 'Departamento' },
    { value: 'puesto', label: 'Puesto de Trabajo' },
    { value: 'agrupacion', label: 'Agrupación' }
  ];
  if (parentType === 'puesto') {
    allowed.unshift({ value: 'empleado', label: 'Empleado' });
  }
  return allowed;
}

/* ==========================================================================
   SIDEBAR PROPERTIES SELECTION VIEW & LOGIC
   ========================================================================== */

function hasChildren(d) {
  if (d.type === 'agrupacion') {
    return (d.internalChildren && d.internalChildren.length > 0) || (d.children && d.children.length > 0);
  }
  return d.children && d.children.length > 0;
}

function toggleNodeCollapse(nodeGlobalId) {
  const parsed = parseId(nodeGlobalId);
  const targetId = parsed.sourceId;
  
  const realNode = findNodeById(globalRoot, targetId);
  if (realNode) {
    realNode.collapsed = !realNode.collapsed;
    renderTree(false);
    saveToStorage();
    
    // Keep selection highlighted if visible
    const resolvedRoot = resolveTree(globalRoot);
    if (selectedNode) {
      const updatedNode = findNodeById(resolvedRoot, selectedNode.id);
      if (updatedNode) {
        selectedNode = updatedNode;
      } else {
        selectNode(null);
      }
    }
  }
}

function toggleNodeInternalCollapse(nodeGlobalId) {
  const parsed = parseId(nodeGlobalId);
  const targetId = parsed.sourceId;
  
  const realNode = findNodeById(globalRoot, targetId);
  if (realNode) {
    realNode.collapsedInternal = !realNode.collapsedInternal;
    renderTree(false);
    saveToStorage();
    
    // Keep selection highlighted if visible
    const resolvedRoot = resolveTree(globalRoot);
    if (selectedNode) {
      const updatedNode = findNodeById(resolvedRoot, selectedNode.id);
      if (updatedNode) {
        selectedNode = updatedNode;
      } else {
        selectNode(null);
      }
    }
  }
}

function selectNode(nodeData) {
  selectedNode = nodeData;
  
  gContainer.selectAll('.node-group')
    .classed('node-selected', d => selectedNode && d.id === selectedNode.id);
  
  drawLinks(flatLinksList);
  updateSidebar();
}

function updateSidebar() {
  const noSelMsg = document.getElementById('no-selection-msg');
  const propForm = document.getElementById('form-node-properties');
  const grpSect = document.getElementById('section-grouping-action');
  const childSect = document.getElementById('section-add-child');
  
  const cloneBanner = document.getElementById('node-clone-disclaimer');
  const empBanner = document.getElementById('node-employee-disclaimer');
  const referenceSelectContainer = document.getElementById('node-prop-reference-container');

  if (!selectedNode) {
    noSelMsg.style.display = 'flex';
    propForm.style.display = 'none';
    grpSect.style.display = 'none';
    childSect.style.display = 'none';
    return;
  }

  noSelMsg.style.display = 'none';
  propForm.style.display = 'flex';

  // Fill Selection properties
  document.getElementById('node-prop-id').value = selectedNode.id;
  document.getElementById('node-prop-name').value = selectedNode.name;
  document.getElementById('node-prop-description').value = selectedNode.description || '';

  // Setup properties type badge style
  const typeBadge = document.getElementById('node-prop-type-badge');
  typeBadge.textContent = selectedNode.type.toUpperCase();
  typeBadge.className = `type-badge type-${selectedNode.type}`;
  
  let badgeColor = 'var(--text-muted)';
  if (selectedNode.type === 'organizacion') badgeColor = 'var(--color-node-org)';
  if (selectedNode.type === 'sede') badgeColor = 'var(--color-node-sede)';
  if (selectedNode.type === 'departamento') badgeColor = 'var(--color-node-dept)';
  if (selectedNode.type === 'puesto') badgeColor = 'var(--color-node-puesto)';
  if (selectedNode.type === 'empleado') badgeColor = 'var(--color-node-emp)';
  if (selectedNode.type === 'agrupacion') badgeColor = 'var(--color-node-grp)';
  typeBadge.style.backgroundColor = badgeColor;

  // Render Cloned / Independent employee Banners
  if (selectedNode.isClone) {
    if (selectedNode.type === 'empleado') {
      empBanner.style.display = 'block';
      cloneBanner.style.display = 'none';
    } else {
      cloneBanner.style.display = 'block';
      empBanner.style.display = 'none';
    }
  } else {
    cloneBanner.style.display = 'none';
    empBanner.style.display = 'none';
  }

  // Handle Root Delete protection (active level root node)
  const activeRoot = getActiveRootResolved();

  // Handle Collapse Container in Sidebar
  const collapseContainer = document.getElementById('node-prop-collapse-container');
  const collapseCheckbox = document.getElementById('node-prop-collapsed');
  if (selectedNode.id !== activeRoot.id && hasChildren(selectedNode)) {
    collapseContainer.style.display = 'block';
    collapseCheckbox.checked = selectedNode.collapsed || false;
  } else {
    collapseContainer.style.display = 'none';
  }

  // Handle Internal Collapse Container (agrupaciones only)
  const collapseInternalContainer = document.getElementById('node-prop-collapse-internal-container');
  const collapseInternalCheckbox = document.getElementById('node-prop-collapsed-internal');
  if (
    selectedNode.type === 'agrupacion' &&
    selectedNode.id !== activeRoot.id &&
    selectedNode.internalChildren &&
    selectedNode.internalChildren.length > 0
  ) {
    collapseInternalContainer.style.display = 'block';
    collapseInternalCheckbox.checked = selectedNode.collapsedInternal || false;
  } else {
    collapseInternalContainer.style.display = 'none';
  }

  const deleteBtn = document.getElementById('btn-delete-node');
  if (selectedNode.id === activeRoot.id) {
    deleteBtn.disabled = true;
    deleteBtn.style.opacity = '0.5';
    deleteBtn.title = "No se puede eliminar la raíz de este organigrama.";
  } else {
    deleteBtn.disabled = false;
    deleteBtn.style.opacity = '1';
    deleteBtn.title = '';
  }

  // Handle Link Reference configuration select
  if (!selectedNode.isClone && selectedNode.type !== 'organizacion' && selectedNode.type !== 'empleado') {
    referenceSelectContainer.style.display = 'block';
    const refSelect = document.getElementById('node-prop-reference');
    refSelect.innerHTML = '';
    
    // Default option
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '-- Estructura propia (sin referencia) --';
    refSelect.appendChild(defOpt);

    // Eligible candidates list
    const candidates = getEligibleReferenceNodes(selectedNode.id);
    candidates.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `[${c.type.toUpperCase()}] ${c.name} (ID: ${c.id})`;
      refSelect.appendChild(opt);
    });

    refSelect.value = selectedNode.referencesNodeId || '';
  } else {
    referenceSelectContainer.style.display = 'none';
  }

  // Handle Grouping panel
  if (selectedNode.type === 'agrupacion') {
    grpSect.style.display = 'block';
    const statusDesc = document.getElementById('grouping-status-desc');
    statusDesc.textContent = `Este elemento es una Agrupación. Puedes hacer clic en el botón inferior para enfocar tu vista en esta estructura interna en pantalla.`;
  } else {
    grpSect.style.display = 'none';
  }

  // Handle Add Child dropdown permissions & Location Selection
  const relationContainer = document.getElementById('group-child-relation-container');
  if (selectedNode.type === 'empleado') {
    childSect.style.display = 'none';
  } else {
    childSect.style.display = 'block';
    
    if (selectedNode.type === 'agrupacion') {
      relationContainer.style.display = 'block';
      document.querySelector('input[name="child-relation"][value="internal"]').checked = true;
    } else {
      relationContainer.style.display = 'none';
    }

    const childSelect = document.getElementById('child-type');
    childSelect.innerHTML = '';

    const allowed = getAllowedChildTypes(selectedNode.type);
    allowed.forEach(opt => {
      const optEl = document.createElement('option');
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      childSelect.appendChild(optEl);
    });

    const warning = document.getElementById('child-type-warning');
    if (selectedNode.type === 'puesto') {
      warning.style.display = 'block';
      warning.textContent = "Puedes crear empleados u otros elementos jerárquicos aquí.";
    } else {
      warning.style.display = 'none';
    }
  }
}

function getEligibleReferenceNodes(currentNodeId) {
  const list = [];
  function traverse(n) {
    if (n.id !== currentNodeId && n.type !== 'organizacion' && n.type !== 'empleado' && !n.referencesNodeId) {
      if (!isDescendant(currentNodeId, n.id)) {
        list.push(n);
      }
    }
    if (n.children) n.children.forEach(traverse);
    if (n.type === 'agrupacion' && n.internalChildren) n.internalChildren.forEach(traverse);
  }
  traverse(globalRoot);
  return list;
}

function isDescendant(parentId, childId) {
  const parent = findNodeById(globalRoot, parentId);
  if (!parent) return false;
  let found = false;
  function traverse(n) {
    if (n.id === childId) {
      found = true;
      return;
    }
    if (n.children) n.children.forEach(traverse);
    if (n.type === 'agrupacion' && n.internalChildren) n.internalChildren.forEach(traverse);
  }
  if (parent.children) parent.children.forEach(traverse);
  if (parent.type === 'agrupacion' && parent.internalChildren) parent.internalChildren.forEach(traverse);
  return found;
}

function findNodeById(current, id) {
  if (current.id === id) return current;
  if (current.children) {
    for (let i = 0; i < current.children.length; i++) {
      const found = findNodeById(current.children[i], id);
      if (found) return found;
    }
  }
  if (current.type === 'agrupacion' && current.internalChildren) {
    for (let i = 0; i < current.internalChildren.length; i++) {
      const found = findNodeById(current.internalChildren[i], id);
      if (found) return found;
    }
  }
  return null;
}

/* ==========================================================================
   MUTATIONS & DISPATCHERS
   ========================================================================== */

function handlePropertyEdit(nodeGlobalId, name, description) {
  const parsed = parseId(nodeGlobalId);
  
  if (parsed.isClone) {
    if (selectedNode.type === 'empleado') {
      // Cloned Employee: update locally in anchor's customData
      const anchor = findNodeById(globalRoot, parsed.anchorId);
      if (anchor && anchor.customData) {
        const parentSourceId = selectedNode.sourceParentId;
        if (anchor.customData[parentSourceId] && anchor.customData[parentSourceId].employees) {
          const emp = anchor.customData[parentSourceId].employees.find(e => e.id === parsed.sourceId);
          if (emp) {
            emp.name = name;
            emp.description = description;
          }
        }
      }
    } else {
      // Cloned Structure: write back to original source node directly
      const source = findNodeById(globalRoot, parsed.sourceId);
      if (source) {
        source.name = name;
        source.description = description;
      }
    }
  } else {
    // Real node: standard edit
    const realNode = findNodeById(globalRoot, nodeGlobalId);
    if (realNode) {
      realNode.name = name;
      realNode.description = description;
    }
  }
  
  // Re-resolve and update selectedNode reference to keep selection glowing during typings
  renderTree(false);
  saveToStorage();
  
  const resolvedRoot = resolveTree(globalRoot);
  const updatedNode = findNodeById(resolvedRoot, nodeGlobalId);
  if (updatedNode) {
    selectedNode = updatedNode;
  }
}

function handleAddChild(parentGlobalId, name, type, description, relationType) {
  const parsed = parseId(parentGlobalId);
  const newId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newChild = {
    id: newId,
    name: name,
    type: type,
    description: description,
    children: []
  };
  
  if (type === 'agrupacion') {
    newChild.internalChildren = [];
  }

  if (parsed.isClone) {
    if (type === 'empleado') {
      // Cloned Employee: add to local customData employees list
      const anchor = findNodeById(globalRoot, parsed.anchorId);
      if (anchor) {
        if (!anchor.customData) anchor.customData = {};
        if (!anchor.customData[parsed.sourceId]) {
          anchor.customData[parsed.sourceId] = { employees: [] };
        }
        anchor.customData[parsed.sourceId].employees.push(newChild);
        showToast(`Empleado "${name}" agregado de forma aislada a este puesto clonado.`, "success");
      }
    } else {
      // Cloned Structure: add structural node to source node children in main tree
      const source = findNodeById(globalRoot, parsed.sourceId);
      if (source) {
        if (relationType === 'internal' && source.type === 'agrupacion') {
          if (!source.internalChildren) source.internalChildren = [];
          source.internalChildren.push(newChild);
        } else {
          if (!source.children) source.children = [];
          source.children.push(newChild);
        }
        showToast(`"${name}" agregado al origen. Todas las referencias se actualizarán.`, "success");
      }
    }
  } else {
    // Normal node add
    const realParent = findNodeById(globalRoot, parentGlobalId);
    if (realParent) {
      if (relationType === 'internal' && realParent.type === 'agrupacion') {
        if (!realParent.internalChildren) realParent.internalChildren = [];
        realParent.internalChildren.push(newChild);
      } else {
        if (!realParent.children) realParent.children = [];
        realParent.children.push(newChild);
      }
      showToast(`"${name}" agregado con éxito.`, "success");
    }
  }

  renderTree(false);
  saveToStorage();

  // Re-select resolved element
  const visualId = parsed.isClone ? `${parsed.anchorId}-clone-${newId}` : newId;
  const resolvedRoot = resolveTree(globalRoot);
  const visualNode = findNodeById(resolvedRoot, visualId);
  if (visualNode) selectNode(visualNode);
}

function handleDeleteNode(nodeGlobalId) {
  const parsed = parseId(nodeGlobalId);
  
  if (parsed.isClone) {
    if (selectedNode.type === 'empleado') {
      const anchor = findNodeById(globalRoot, parsed.anchorId);
      if (anchor) {
        const parentSourceId = selectedNode.sourceParentId;
        if (anchor.customData && anchor.customData[parentSourceId]) {
          anchor.customData[parentSourceId].employees = anchor.customData[parentSourceId].employees.filter(
            e => e.id !== parsed.sourceId
          );
          showToast("Empleado eliminado de esta instancia.", "success");
        }
      }
    } else {
      deleteNodeFromRealTree(parsed.sourceId);
      showToast("Elemento eliminado de la estructura de origen.", "success");
    }
  } else {
    deleteNodeFromRealTree(nodeGlobalId);
    showToast("Elemento eliminado.", "success");
  }

  selectNode(null);
  renderTree(false);
  saveToStorage();
}

function deleteNodeFromRealTree(nodeId) {
  function removeNode(parent) {
    if (parent.children) {
      const initLen = parent.children.length;
      parent.children = parent.children.filter(c => c.id !== nodeId);
      if (parent.children.length < initLen) return true;
      for (let i = 0; i < parent.children.length; i++) {
        if (removeNode(parent.children[i])) return true;
      }
    }
    if (parent.type === 'agrupacion' && parent.internalChildren) {
      const initLen = parent.internalChildren.length;
      parent.internalChildren = parent.internalChildren.filter(c => c.id !== nodeId);
      if (parent.internalChildren.length < initLen) return true;
      for (let i = 0; i < parent.internalChildren.length; i++) {
        if (removeNode(parent.internalChildren[i])) return true;
      }
    }
    return false;
  }
  removeNode(globalRoot);
}

/* ==========================================================================
   VIEWPORT FIT & SCALING UTILITIES
   ========================================================================== */

function fitTreeToScreen() {
  if (!svg || !currentLayoutRoot) return;

  const svgEl = document.getElementById('main-svg');
  const width = svgEl.clientWidth;
  const height = svgEl.clientHeight;

  if (flatNodesList.length === 0) {
    svg.transition().duration(500).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(width / 2, 50).scale(1)
    );
    return;
  }

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  flatNodesList.forEach(node => {
    const size = nodeSizes[node.type] || [200, 90];
    const w = node.measuredWidth || size[0];
    const h = node.measuredHeight || size[1];

    const left = node.globalX - w / 2;
    const right = node.globalX + w / 2;
    const top = node.globalY - h / 2;
    const bottom = node.globalY + h / 2;

    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  });

  const treeW = maxX - minX;
  const treeH = maxY - minY;

  const padding = 60;
  const scaleX = (width - padding * 2) / treeW;
  const scaleY = (height - padding * 2) / treeH;
  
  let scale = Math.min(scaleX, scaleY);
  scale = Math.max(0.08, Math.min(1.4, scale));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const tx = width / 2 - centerX * scale;
  const ty = height / 2 - centerY * scale;

  svg.transition()
    .duration(750)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
}

/* ==========================================================================
   DATA VALIDATION ENGINE (FOR SAFE IMPORTS)
   ========================================================================== */

function validateOrgChart(node, isInternal = false, parentType = null) {
  if (!node || typeof node !== 'object') {
    return { valid: false, error: "Estructura vacía o inválida." };
  }

  if (!node.id || !node.name || !node.type) {
    return { valid: false, error: `Nodo inválido detectado (falta id, name o type).` };
  }

  const validTypes = ['organizacion', 'sede', 'departamento', 'puesto', 'empleado', 'agrupacion'];
  if (!validTypes.includes(node.type)) {
    return { valid: false, error: `Tipo de nodo inválido "${node.type}" en "${node.name}".` };
  }

  if (node.type === 'organizacion') {
    if (isInternal) {
      return { valid: false, error: `La Organización ("${node.name}") no puede estar dentro de una Agrupación.` };
    }
    if (parentType !== null) {
      return { valid: false, error: `La Organización ("${node.name}") solo puede ser la raíz global.` };
    }
  }

  if (node.type === 'empleado') {
    if (parentType !== 'puesto') {
      return { valid: false, error: `El Empleado "${node.name}" está en una ubicación inválida. Sólo pueden ir dentro de Puestos de Trabajo.` };
    }
    if (node.children && node.children.length > 0) {
      return { valid: false, error: `El Empleado "${node.name}" tiene hijos. Los empleados no pueden generar nodos hijos.` };
    }
  }

  if (node.type === 'agrupacion') {
    if (node.internalChildren) {
      if (!Array.isArray(node.internalChildren)) {
        return { valid: false, error: `La propiedad "internalChildren" de "${node.name}" debe ser un arreglo.` };
      }
      for (let i = 0; i < node.internalChildren.length; i++) {
        const childVal = validateOrgChart(node.internalChildren[i], true, node.type);
        if (!childVal.valid) {
          return childVal;
        }
      }
    }
  }

  if (node.children) {
    if (!Array.isArray(node.children)) {
      return { valid: false, error: `La propiedad "children" de "${node.name}" debe ser un arreglo.` };
    }
    for (let i = 0; i < node.children.length; i++) {
      const childVal = validateOrgChart(node.children[i], isInternal, node.type);
      if (!childVal.valid) {
        return childVal;
      }
    }
  }

  return { valid: true };
}

/* ==========================================================================
   LOCALSTORAGE CACHE & NOTIFICATION SYSTEM
   ========================================================================== */

function saveToStorage() {
  try {
    localStorage.setItem('flexorg_data', JSON.stringify(globalRoot));
  } catch(e) {
    console.error("Failed saving to localStorage", e);
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconSVG = '';
  if (type === 'success') {
    iconSVG = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  } else if (type === 'error') {
    iconSVG = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  } else {
    iconSVG = '<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }
  
  toast.innerHTML = `${iconSVG}<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 200);
  }, 3500);
}
