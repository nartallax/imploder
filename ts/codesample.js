// @ts-check

var ts = require('typescript');

var host = ts.createSolutionBuilderWithWatchHost(
  ts.sys,
  void 0,
  reportDiag,
  reportDiag,
  reportWatch);

var buildStart = Date.now();

var solutionBuilder = ts.createSolutionBuilderWithWatch(
  host,
  [__dirname],
  { incremental: false }, {});

initiateFirstBuild();


function initiateFirstBuild() {``
  var firstBuild = solutionBuilder.getNextInvalidatedProject();
  if (firstBuild) {
    buildStart = Date.now();
    startBuild(firstBuild);
  }

  solutionBuilder.build();
}

/**
 * @param {import('typescript').InvalidatedProject<import('typescript').EmitAndSemanticDiagnosticsBuilderProgram>} proj
 * @param {import('typescript').Diagnostic=} watchDiag 
 */
function startBuild(proj, watchDiag) {
  ts.sys.write(
    '\x1b[93m ' + (ts.InvalidatedProjectKind[proj.kind] + '          ').slice(0, 10) + '\x1b[0m' +
    (watchDiag ? '' : '\n'));

  if (watchDiag) reportDiag(watchDiag);

  buildStart = Date.now();

  if (proj && proj.kind === ts.InvalidatedProjectKind.Build) {
    progSource = proj;
    proj.emit(
      void 0,
      void 0,
      void 0,
      void 0,
      { after: [transformInjectStatementNumbers] });
  }

}


function completeBuild(watchDiag) {
  ts.sys.write('\x1b[90m ' + (((Date.now() - buildStart) / 1000) + 's        ').slice(0, 10) + '\x1b[0m');
  if (watchDiag) reportDiag(watchDiag);
}

/** @type {import('typescript').FormatDiagnosticsHost} */
var diagHost;
/** @param {import('typescript').Diagnostic} diag */
function reportDiag(diag) {
  if (!diagHost) {
    diagHost = {
      getCanonicalFileName: function (fileName) {
        return ts.sys.resolvePath(fileName)
      },
      getCurrentDirectory: function () {
        return ts.sys.getCurrentDirectory();
      },
      getNewLine: function () {
        return ts.sys.newLine;
      }
    };
  }

  var output = ts.sys.writeOutputIsTTY && ts.sys.writeOutputIsTTY() ?
    ts.formatDiagnosticsWithColorAndContext([diag], diagHost) :
    ts.formatDiagnostic(diag, diagHost);

  output = output.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');

  ts.sys.write(output + '\n');
}

/** @param {import('typescript').Diagnostic} diag */
function reportWatch(diag) {
  var proj = solutionBuilder.getNextInvalidatedProject();
  if (proj && /** @type {*} */(proj).getProgram) {
    progSource = /** @type {*} */(proj);
  }

  if (proj)
    startBuild(proj, diag);
  else
    completeBuild(diag);
}


/** @type {{ getProgram(): import('typescript').Program }} */
var progSource;
/** @type {import('typescript').TypeChecker} */
var checker;
/** @param {import('typescript').TransformationContext} context */
function transformInjectStatementNumbers(context) {
  checker = progSource.getProgram().getTypeChecker();
  return transformFile;

  function transformFile(sourceFile) {
    console.log('   transforming(', sourceFile.fileName, ')...');
    return ts.updateSourceFileNode(
      sourceFile,
      sourceFile.statements.map(decorateStatementWithComplexityAndType));
  }
}

/**
 * @param {import('typescript').Statement} statement 
 */
function decorateStatementWithComplexityAndType(statement) {
  var nodeCount = 0;
  var type;